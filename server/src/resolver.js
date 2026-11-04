// Resolver de señales de plataformas: convierte un link de Twitch/YouTube/
// Facebook (la transmisión pública propia del canal) en la URL HLS del momento.
// Esas plataformas no dan una URL fija: el .m3u8 tiene token y cambia, por eso se
// resuelve al vuelo (con cache corto) cada vez que se abre/reconecta el canal.
//
// Twitch se resuelve en Node puro (una llamada a su API pública), así funciona en
// contenedores de solo lectura sin instalar nada. YouTube/Facebook usan
// `streamlink` si está disponible en el servidor.

import { execFile } from 'node:child_process';

// Hosts que sabemos resolver.
const HOSTS = /(^|\.)(twitch\.tv|youtube\.com|youtu\.be|facebook\.com|fb\.watch|kick\.com|dailymotion\.com)$/i;

// Cache de resoluciones: evita re-resolver en cada refresco del manifiesto.
const CACHE = new Map(); // pageUrl -> { url, exp }
const TTL_MS = 45_000;
const RESOLVE_TIMEOUT_MS = 20_000;

// ¿Es un link de plataforma (no un .m3u8 directo)?
export function isResolvable(u) {
  try {
    return HOSTS.test(new URL(u).hostname);
  } catch {
    return false;
  }
}

function hostOf(u) {
  try { return new URL(u).hostname.toLowerCase(); } catch { return ''; }
}

// ---------- Twitch (Node puro, sin binario) ----------
// Client-ID público del reproductor web de Twitch (el mismo que usa twitch.tv).
const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

function twitchChannel(u) {
  try {
    const seg = new URL(u).pathname.split('/').filter(Boolean);
    return seg[0] ? seg[0].toLowerCase() : null;
  } catch {
    return null;
  }
}

async function resolveTwitch(channel) {
  const gql = {
    operationName: 'PlaybackAccessToken_Template',
    query:
      'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {  streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) {    value    signature    __typename  }  videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) {    value    signature    __typename  }}',
    variables: { isLive: true, login: channel, isVod: false, vodID: '', playerType: 'site' },
  };
  const r = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
    body: JSON.stringify(gql),
    signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error('twitch gql HTTP ' + r.status);
  const j = await r.json();
  const tok = j?.data?.streamPlaybackAccessToken;
  if (!tok?.value || !tok?.signature) throw new Error('canal offline o inexistente');
  const p = Math.floor(Math.random() * 1e7);
  const qs = new URLSearchParams({
    allow_source: 'true',
    allow_audio_only: 'true',
    fast_bread: 'true',
    p: String(p),
    player_backend: 'mediaplayer',
    playlist_include_framerate: 'true',
    reassignments_supported: 'true',
    sig: tok.signature,
    token: tok.value,
    cdm: 'wv',
    player_version: '1.24.0',
  });
  return `https://usher.ttvnw.net/api/channel/hls/${channel}.m3u8?${qs.toString()}`;
}

// ---------- streamlink (YouTube/Facebook/otros) ----------
function runStreamlink(pageUrl) {
  return new Promise((resolve, reject) => {
    execFile(
      'streamlink',
      ['--stream-url', pageUrl, 'best'],
      { timeout: RESOLVE_TIMEOUT_MS, maxBuffer: 1 << 20 },
      (err, stdout, stderr) => {
        if (err) {
          if (err.code === 'ENOENT') {
            return reject(new Error('streamlink no está instalado (necesario para YouTube/Facebook)'));
          }
          return reject(new Error((String(stderr) || err.message || 'error').trim().slice(0, 200)));
        }
        const out = String(stdout).trim();
        if (!/^https?:\/\//i.test(out)) {
          return reject(new Error('sin señal en vivo (' + out.slice(0, 120) + ')'));
        }
        resolve(out);
      }
    );
  });
}

// Resuelve (con cache corto) el link de plataforma a su URL HLS actual.
export async function resolvePlatform(pageUrl) {
  const now = Date.now();
  const hit = CACHE.get(pageUrl);
  if (hit && hit.exp > now) return hit.url;

  let url;
  const host = hostOf(pageUrl);
  if (/(^|\.)twitch\.tv$/.test(host)) {
    const ch = twitchChannel(pageUrl);
    if (!ch) throw new Error('canal de Twitch inválido');
    url = await resolveTwitch(ch);
  } else {
    url = await runStreamlink(pageUrl);
  }

  CACHE.set(pageUrl, { url, exp: now + TTL_MS });
  return url;
}
