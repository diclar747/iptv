// Resolver de señales de plataformas: convierte un link de Twitch/YouTube/
// Facebook/Kick (la transmisión pública propia del canal) en la URL HLS del
// momento, usando `streamlink`. Esas plataformas no dan una URL fija: el .m3u8
// tiene token y cambia, por eso se resuelve al vuelo (con cache corto) cada vez
// que se abre/reconecta el canal.
//
// Requiere `streamlink` instalado en el servidor (ver README / deploy).

import { execFile } from 'node:child_process';

// Hosts que sabemos resolver con streamlink.
const HOSTS = /(^|\.)(twitch\.tv|youtube\.com|youtu\.be|facebook\.com|fb\.watch|kick\.com|dailymotion\.com)$/i;

// Cache de resoluciones: evita correr streamlink en cada refresco del manifiesto.
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

function runStreamlink(pageUrl) {
  return new Promise((resolve, reject) => {
    execFile(
      'streamlink',
      ['--stream-url', '--twitch-disable-ads', pageUrl, 'best'],
      { timeout: RESOLVE_TIMEOUT_MS, maxBuffer: 1 << 20 },
      (err, stdout, stderr) => {
        if (err) {
          if (err.code === 'ENOENT') {
            return reject(new Error('streamlink no está instalado en el servidor'));
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
  const url = await runStreamlink(pageUrl);
  CACHE.set(pageUrl, { url, exp: now + TTL_MS });
  return url;
}
