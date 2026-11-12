import express from 'express';
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import { one, query, tx } from './pg.js';
import { createSession, hashPassword, parseCookies, publicUser, setSessionCookie } from './auth.js';

const router = express.Router();
const token = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(value).digest('base64url');
const opaque = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const path = '/auth/google';
const callbackPath = '/api' + path + '/callback';
const cookieName = 'livetv_google_flow';
const cookie = { httpOnly: true, secure: true, sameSite: 'lax', path: callbackPath };
const config = () => ({
 clientId: process.env.GOOGLE_CLIENT_ID,
 clientSecret: process.env.GOOGLE_CLIENT_SECRET,
 redirect: process.env.GOOGLE_REDIRECT_URI || 'https://live.cd.com.py' + callbackPath,
});
const ready = ({ clientId, clientSecret }) => Boolean(clientId && clientSecret);
const noStore = res => res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
let keys = [];
let keysUntil = 0;

async function identity(idToken, clientId, nonce) {
 if (typeof idToken !== 'string' || idToken.length > 12000) throw Error('Invalid Google token');
 const parts = idToken.split('.');
 if (parts.length !== 3) throw Error('Invalid Google token');
 const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
 const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
 if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw Error('Invalid Google algorithm');
 if (Date.now() >= keysUntil || !keys.some(key => key.kid === header.kid)) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw Error('Google keys unavailable');
  keys = (await response.json()).keys;
  const seconds = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1]) || 60;
  keysUntil = Date.now() + Math.min(seconds, 3600) * 1000;
 }
 const key = keys.find(key => key.kid === header.kid && key.kty === 'RSA');
 if (!key || !verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw Error('Invalid Google signature');
 const now = Math.floor(Date.now()/1000);
 if (!['https://accounts.google.com','accounts.google.com'].includes(claims.iss) ||
     claims.aud !== clientId || (claims.azp && claims.azp !== clientId) ||
     !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
     claims.nonce !== nonce || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 ||
     claims.email_verified !== true || typeof claims.email !== 'string' || claims.email.length > 254) {
  throw Error('Invalid Google identity');
 }
 return claims;
}

function profileText(value) {
 return typeof value === 'string' ? value.trim().slice(0, 80) || null : null;
}

function profilePicture(value) {
 if (typeof value !== 'string' || value.length > 2048) return null;
 try {
  const url = new URL(value);
  return url.protocol === 'https:' && /^lh\d+\.googleusercontent\.com$/.test(url.hostname)
   && !url.port && !url.username && !url.password ? url.href : null;
 } catch {
  return null;
 }
}

export function googleAccount(claims, referral) {
 const email = claims.email.toLowerCase();
 const name = profileText(claims.name);
 const firstName = profileText(claims.given_name);
 const lastName = profileText(claims.family_name);
 const picture = profilePicture(claims.picture);
 return tx(async client => {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['google:' + claims.sub]);
  const existing = (await client.query('SELECT * FROM users WHERE google_subject=$1', [claims.sub])).rows[0];
  if (existing) {
   if (existing.status !== 'active' || existing.deleted_at) return existing;
   return (await client.query(`UPDATE users SET
     display_name=COALESCE(NULLIF(display_name,''),$2),
     first_name=COALESCE(NULLIF(first_name,''),$3),
     last_name=COALESCE(NULLIF(last_name,''),$4),
     google_picture_url=COALESCE($5,google_picture_url)
     WHERE id=$1 RETURNING *`, [existing.id, name, firstName, lastName, picture])).rows[0];
  }
  const previous = (await client.query('SELECT id FROM users WHERE lower(email)=$1 LIMIT 1', [email])).rows[0];
  if (previous) throw Object.assign(Error('Existing email'), { oauthError: 'existing' });
  const parent = referral ? (await client.query(`SELECT u.id FROM users u LEFT JOIN affiliate_referral_aliases a ON a.user_id=u.id
    WHERE (u.username=$1 OR u.affiliate_code::text=$1 OR a.alias=$1) AND u.role<>'admin' AND u.status='active' AND u.deleted_at IS NULL LIMIT 1`, [referral])).rows[0] : null;
  const username = 'google_' + randomBytes(12).toString('hex');
  const { hash, salt } = hashPassword(token());
  return (await client.query(`WITH created AS (
    INSERT INTO users(username,pass_hash,pass_salt,google_subject,email,display_name,role,parent_id,created_by,expires_at,max_connections,package_name,first_name,last_name,google_picture_url)
    VALUES($1,$2,$3,$4,$5,$6,'client',$7,$7,now()+interval '24 hours',1,'Prueba gratis 24h',$8,$9,$10) RETURNING *
   ), alias AS (INSERT INTO affiliate_referral_aliases(alias,user_id) SELECT username,id FROM created)
   SELECT * FROM created`, [username, hash, salt, claims.sub, email, name, parent?.id ?? null, firstName, lastName, picture])).rows[0];
 });
}

router.get(path + '/status', (req, res) => noStore(res).json({ enabled: ready(config()) }));
router.get(path + '/start', async (req, res) => {
 noStore(res);
 const settings = config();
 if (!ready(settings)) return res.redirect('/?google=unavailable');
 const challenge = req.query.mobile_challenge;
 if (challenge !== undefined && !opaque(challenge)) return res.status(400).send('Solicitud de Google inválida.');
 const state = token(), browser = token(), verifier = token(), nonce = token();
 const referral = typeof req.query.ref === 'string' ? req.query.ref.trim().slice(0, 100) : '';
 try {
  await query('DELETE FROM google_oauth_requests WHERE expires_at<=now()');
  await query(`INSERT INTO google_oauth_requests(state_hash,browser_hash,verifier,nonce,referral,mobile_challenge,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,now()+interval '10 minutes')`, [digest(state), digest(browser), verifier, nonce, referral, challenge ?? null]);
  res.cookie(cookieName, browser, { ...cookie, maxAge: 600000 });
  const params = new URLSearchParams({ client_id: settings.clientId, redirect_uri: settings.redirect, response_type: 'code',
   scope: 'openid email profile', state, nonce, code_challenge: digest(verifier), code_challenge_method: 'S256', prompt: 'select_account' });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params);
 } catch { res.redirect('/?google=failed'); }
});

router.get(path + '/callback', async (req, res) => {
 noStore(res);
 const settings = config();
 if (!ready(settings)) return res.redirect('/?google=unavailable');
 let flow;
 try {
  const browser = parseCookies(req)[cookieName];
  res.clearCookie(cookieName, cookie);
  if (!opaque(req.query.state) || !opaque(browser)) return res.redirect('/?google=failed');
  flow = await one(`DELETE FROM google_oauth_requests WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>now()
    RETURNING verifier,nonce,referral,mobile_challenge`, [digest(req.query.state), digest(browser)]);
  if (!flow) return res.redirect('/?google=failed');
  if (req.query.error === 'access_denied') return res.redirect('/?google=cancelled');
  if (typeof req.query.code !== 'string' || req.query.code.length > 3000) return res.redirect('/?google=failed');
  const response = await fetch('https://oauth2.googleapis.com/token', {
   method: 'POST', signal: AbortSignal.timeout(12000),
   body: new URLSearchParams({ grant_type: 'authorization_code', code: req.query.code, client_id: settings.clientId,
    client_secret: settings.clientSecret, redirect_uri: settings.redirect, code_verifier: flow.verifier }),
  });
  if (!response.ok) throw Error('Google exchange failed');
  const claims = await identity((await response.json()).id_token, settings.clientId, flow.nonce);
  const user = await googleAccount(claims, flow.referral);
  if (user.status !== 'active' || user.deleted_at) return res.redirect('/?google=disabled');
  if (flow.mobile_challenge) {
   await query('DELETE FROM google_mobile_grants WHERE expires_at<=now()');
   await query(`INSERT INTO google_mobile_grants(challenge,user_id,expires_at)
     VALUES($1,$2,now()+interval '2 minutes') ON CONFLICT (challenge) DO NOTHING`, [flow.mobile_challenge,user.id]);
   return res.type('html').send('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width"><title>LiveTV</title><main style="font:1rem system-ui;margin:12vh auto;max-width:28rem;padding:1rem"><h1>Acceso confirmado</h1><p>Volvé a la app de LiveTV para continuar.</p></main></html>');
  }
  setSessionCookie(res, await createSession(user.id));
  res.redirect('/');
 } catch (error) { res.redirect('/?google=' + (error.oauthError || 'failed')); }
});

router.post(path + '/mobile', async (req, res, next) => {
 noStore(res);
 const verifier = req.body?.verifier;
 if (!opaque(verifier)) return res.status(400).json({ error: 'Solicitud de Google inválida.' });
 try {
  const grant = await one('DELETE FROM google_mobile_grants WHERE challenge=$1 AND expires_at>now() RETURNING user_id', [digest(verifier)]);
  if (!grant) return res.json({ user: null });
  const user = await one("SELECT * FROM users WHERE id=$1 AND status='active' AND deleted_at IS NULL", [grant.user_id]);
  if (!user) return res.status(403).json({ error: 'Cuenta deshabilitada.' });
  setSessionCookie(res, await createSession(user.id));
  res.json({ user: publicUser(user, { self: true }) });
 } catch (error) { next(error); }
});

export default router;
