// Proxy de streams: resuelve CORS y aplica cabeceras (User-Agent/Referer)
// que muchos servidores IPTV exigen. Para HLS, reescribe el manifiesto .m3u8
// de modo que segmentos, claves y sub-playlists también pasen por el proxy.
//
//   GET /api/stream?url=<encoded>&ua=<userAgent>&ref=<referrer>
//
// El navegador siempre habla con nuestro backend (mismo origen), así que no
// hay bloqueo CORS y el reproductor no necesita conocer las cabeceras reales.

import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { streamToken } from './streamToken.js';
import { isResolvable, resolvePlatform } from './resolver.js';

// UA de navegador por defecto: algunos orígenes rechazan UA vacío o de Node.
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const M3U8_CT = /mpegurl/i;

function isManifest(url, contentType) {
  if (contentType && M3U8_CT.test(contentType)) return true;
  return /\.m3u8(\?|$)/i.test(url);
}

// Construye la URL de proxy para una URL absoluta, preservando ua/ref.
// En modo token (cast), agrega ?t=<token> para que los segmentos/sub-playlists
// también se puedan servir sin cookie al dispositivo que proyecta.
function proxify(absoluteUrl, ua, ref, tokenMode) {
  const qs = new URLSearchParams({ url: absoluteUrl });
  if (ua) qs.set('ua', ua);
  if (ref) qs.set('ref', ref);
  if (tokenMode) qs.set('t', streamToken(absoluteUrl));
  return `/api/stream?${qs.toString()}`;
}

// Reescribe un manifiesto HLS para enrutar todo por el proxy.
// baseUrl = URL final del manifiesto (tras redirects) para resolver relativos.
function rewriteManifest(text, baseUrl, ua, ref, tokenMode) {
  const lines = text.split(/\r?\n/);
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Atributos con URI="..." (EXT-X-KEY, EXT-X-MEDIA, EXT-X-MAP, etc.)
    if (trimmed.startsWith('#')) {
      if (!trimmed.includes('URI="')) return line;
      return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
        const abs = new URL(uri, baseUrl).href;
        return `URI="${proxify(abs, ua, ref, tokenMode)}"`;
      });
    }

    // Línea de recurso (segmento .ts/.m4s o sub-playlist .m3u8)
    const abs = new URL(trimmed, baseUrl).href;
    return proxify(abs, ua, ref, tokenMode);
  });
  return out.join('\n');
}

export function streamHandler() {
  return async (req, res) => {
    let target = req.query.url;
    if (!target || !/^https?:\/\//i.test(target)) {
      return res.status(400).json({ error: 'Parámetro url inválido' });
    }
    // Link de plataforma (Twitch/YouTube/Facebook): resolver a su HLS actual
    // antes de proxear. Se hace tras la autorización (token/cookie) y con cache.
    if (isResolvable(target)) {
      try {
        target = await resolvePlatform(target);
      } catch (e) {
        return res.status(502).json({ error: 'No se pudo resolver la señal', detail: e.message });
      }
    }
    const ua = req.query.ua || DEFAULT_UA;
    const ref = req.query.ref || undefined;
    // Si la petición llegó con token (cast), propagar el token a los recursos
    // reescritos del manifiesto para que el dispositivo los pueda pedir.
    const tokenMode = Boolean(req.query.t);

    const controller = new AbortController();
    req.on('close', () => controller.abort());
    // Timeout de conexión/primer byte: si el origen cuelga sin responder, se
    // aborta en vez de dejar al cliente esperando para siempre (así el
    // reproductor recibe el error enseguida y reintenta). Se limpia al llegar
    // la respuesta; el streaming del cuerpo ya no tiene tope (TV en vivo).
    const CONNECT_TIMEOUT_MS = 15000;
    const connectTimer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);

    try {
      const headers = { 'User-Agent': ua };
      if (ref) headers['Referer'] = ref;
      // Reenviar Range del cliente para seeking de segmentos, pero NUNCA para
      // manifiestos .m3u8: un CDN puede devolverlos truncados (206) y romper
      // el parseo del reproductor.
      const looksManifest = /\.m3u8(\?|$)/i.test(target);
      if (req.headers.range && !looksManifest) headers['Range'] = req.headers.range;

      const upstream = await fetch(target, {
        headers,
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(connectTimer); // ya respondió: el cuerpo puede fluir sin tope

      const contentType = upstream.headers.get('content-type') || '';
      const baseUrl = upstream.url || target; // URL final tras redirects

      // Manifiesto HLS -> reescribir y devolver como texto.
      // Solo si el cuerpo es realmente un manifiesto (#EXTM3U); muchos
      // orígenes caídos devuelven HTML/error con URL .m3u8.
      if (isManifest(baseUrl, contentType)) {
        const body = await upstream.text();
        if (body.trimStart().startsWith('#EXTM3U')) {
          const rewritten = rewriteManifest(body, baseUrl, req.query.ua, ref, tokenMode);
          // Siempre 200: enviamos el manifiesto completo reescrito.
          res.status(200);
          res.set('Content-Type', 'application/vnd.apple.mpegurl');
          res.set('Cache-Control', 'no-cache');
          return res.send(rewritten);
        }
        // No es un manifiesto válido: devolver tal cual (el reproductor fallará
        // limpiamente en vez de intentar reproducir basura).
        res.status(upstream.status);
        res.set('Content-Type', contentType || 'text/plain');
        return res.send(body);
      }

      // Cualquier otro recurso (segmentos, claves, audio): pasar bytes.
      res.status(upstream.status);
      const passthrough = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
      for (const h of passthrough) {
        const v = upstream.headers.get(h);
        if (v) res.set(h, v);
      }
      res.set('Cache-Control', 'no-cache');

      if (upstream.body) {
        // pipeline() propaga y limpia errores sin dejar un 'error' sin manejar
        // (un segmento que corta con ECONNRESET no debe tumbar el servidor).
        try {
          await pipeline(Readable.fromWeb(upstream.body), res);
        } catch {
          // El cliente cerró o el origen cortó la conexión: nada que hacer.
          if (!res.writableEnded) res.destroy();
        }
      } else {
        res.end();
      }
    } catch (err) {
      clearTimeout(connectTimer);
      if (err.name === 'AbortError') return; // cliente cerró o timeout de conexión
      if (!res.headersSent) {
        res.status(502).json({ error: 'Proxy error', detail: err.message });
      } else if (!res.writableEnded) {
        res.destroy();
      }
    }
  };
}
