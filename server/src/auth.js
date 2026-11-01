// Autenticación: hash de contraseñas (scrypt), sesiones por token en cookie,
// y middlewares de autorización por rol y por suscripción activa.
// Los datos de usuario viven en PostgreSQL (ver pg.js / schema.sql).

import { scryptSync, randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { one } from './pg.js';

// ---------- Contraseñas ----------
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
export function verifyPassword(password, salt, hash) {
  const key = scryptSync(password, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return key.length === ref.length && timingSafeEqual(key, ref);
}

// ---------- Sesiones (en memoria) ----------
const sessions = new Map(); // token -> { userId, at }

export function createSession(userId) {
  const token = randomUUID().replace(/-/g, '') + randomBytes(8).toString('hex');
  sessions.set(token, { userId, at: Date.now() });
  return token;
}
export function destroySession(token) {
  sessions.delete(token);
}
export async function userFromToken(token) {
  const s = token && sessions.get(token);
  if (!s) return null;
  return one('SELECT * FROM users WHERE id = $1', [s.userId]);
}

// ---------- Cookies ----------
export function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`);
}
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

// Token desde cookie `sid` o header Authorization: Bearer (para APIs/tests).
export function tokenFromReq(req) {
  const cookies = parseCookies(req);
  if (cookies.sid) return cookies.sid;
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// ---------- Estado de suscripción ----------
// Opera sobre una fila de la tabla users (snake_case).
export function subscriptionStatus(user) {
  if (user.role !== 'client') return { active: true, reason: null };
  if (user.status !== 'active') return { active: false, reason: 'disabled' };
  if (user.expires_at && new Date(user.expires_at).getTime() < Date.now()) {
    return { active: false, reason: 'expired' };
  }
  return { active: true, reason: null };
}

// Vista pública del usuario (sin hash/salt), camelCase para el frontend.
export function publicUser(u) {
  if (!u) return null;
  const base = {
    id: u.id,
    username: u.username,
    role: u.role,
    status: u.status,
    createdAt: u.created_at,
    createdBy: u.created_by,
    parentId: u.parent_id,
    note: u.note || null,
  };
  if (u.role === 'reseller') base.credits = u.credits || 0;
  if (u.role === 'client') {
    base.expiresAt = u.expires_at || null;
    base.maxConnections = u.max_connections || 1;
    base.packageName = u.package_name || null;
    base.subscription = subscriptionStatus(u);
  }
  return base;
}

// ---------- Middlewares ----------
export async function attachUser(req, res, next) {
  try {
    req.user = await userFromToken(tokenFromReq(req));
  } catch (e) {
    req.user = null;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Sin permiso' });
    next();
  };
}

// Puede ver el catálogo: admin/reseller siempre; cliente solo con suscripción activa.
export function requireActiveViewer(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  const sub = subscriptionStatus(req.user);
  if (!sub.active) {
    return res.status(403).json({ error: 'Suscripción inactiva', reason: sub.reason });
  }
  next();
}
