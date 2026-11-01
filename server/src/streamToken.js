// Token corto (HMAC) que autoriza /api/stream SIN cookie de sesión. Se usa para
// proyectar a Chromecast/Smart TV: el dispositivo no tiene la cookie del usuario,
// así que el reproductor le pasa una URL con ?t=<token> firmado por el servidor.
import crypto from 'node:crypto';

const SECRET = process.env.STREAM_SECRET || 'senal-stream-secret-dev';

export function streamToken(url) {
  return crypto.createHmac('sha256', SECRET).update(String(url)).digest('base64url').slice(0, 24);
}

export function validToken(url, t) {
  return Boolean(url && t && t === streamToken(url));
}
