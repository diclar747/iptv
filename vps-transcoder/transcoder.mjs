// Transcodificador HLS on-demand para SEÑAL. Corre en un VPS con ffmpeg.
//
// Para canales cuyo stream NO decodifica en el navegador (p. ej. Telefuturo:
// H.264 que se une a mitad de GOP), re-encodea a H.264 4:2:0 con keyframes
// alineados -> HLS limpio que el navegador sí reproduce.
//
// Sin dependencias (solo Node + ffmpeg en el PATH).
//
//   PORT=8787 node transcoder.mjs
//
// Pedido:  GET /tc?src=<url m3u8 de origen>&ua=<ua>&ref=<ref>
//          -> inicia ffmpeg (si no está corriendo ya para ese src) y redirige
//             a /hls/<id>/index.m3u8. Los que piden el MISMO src comparten
//             el mismo proceso. Se apaga solo tras unos segundos sin pedidos.
//
// Seguridad: solo transcodifica orígenes de la allowlist (CDNs conocidos).

import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = Number(process.env.PORT || 8787);
const IDLE_MS = Number(process.env.IDLE_MS || 60000); // apaga ffmpeg tras 60s sin pedidos
const ROOT = path.join(os.tmpdir(), 'senal-hls');
// Solo se transcodifican orígenes de estos dominios (evita abuso del endpoint).
const ALLOW = /(^|\.)(desdeparaguay\.net|desdepylabs\.com|cloudfront\.net)$/i;
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

fs.mkdirSync(ROOT, { recursive: true });
const jobs = new Map(); // id -> { proc, dir, lastAccess }

const idFor = (src) => createHash('sha1').update(src).digest('hex').slice(0, 16);

function allowed(src) {
  try { return ALLOW.test(new URL(src).hostname); } catch { return false; }
}

function startJob(src, ua, ref) {
  const id = idFor(src);
  const existing = jobs.get(id);
  if (existing) { existing.lastAccess = Date.now(); return id; }
  const dir = path.join(ROOT, id);
  fs.mkdirSync(dir, { recursive: true });

  const headerLines = [];
  if (ua) headerLines.push(`User-Agent: ${ua}`);
  if (ref) headerLines.push(`Referer: ${ref}`);

  const args = [
    '-y', '-loglevel', 'warning', '-nostdin',
    '-fflags', '+genpts+discardcorrupt',
    ...(headerLines.length ? ['-headers', headerLines.join('\r\n') + '\r\n'] : []),
    '-i', src,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main', '-level', '4.0', '-pix_fmt', 'yuv420p',
    '-g', '50', '-keyint_min', '50', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-f', 'hls', '-hls_time', '2', '-hls_list_size', '6',
    '-hls_flags', 'delete_segments+omit_endlist+independent_segments',
    '-hls_segment_filename', path.join(dir, 'seg_%d.ts'),
    path.join(dir, 'index.m3u8'),
  ];

  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'inherit'] });
  const job = { proc, dir, lastAccess: Date.now() };
  jobs.set(id, job);
  proc.on('exit', () => {
    jobs.delete(id);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
  });
  console.log(`[tc] start ${id}  ${src}`);
  return id;
}

// Apaga procesos sin pedidos recientes.
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.lastAccess > IDLE_MS) {
      console.log(`[tc] idle stop ${id}`);
      try { job.proc.kill('SIGKILL'); } catch { /* noop */ }
    }
  }
}, 15000);

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (u.pathname === '/health') { res.writeHead(200); return res.end('ok'); }

  if (u.pathname === '/tc') {
    const src = u.searchParams.get('src') || '';
    if (!/^https?:\/\//i.test(src) || !allowed(src)) { res.writeHead(400); return res.end('bad/forbidden src'); }
    const id = startJob(src, u.searchParams.get('ua') || DEFAULT_UA, u.searchParams.get('ref') || '');
    const file = path.join(ROOT, id, 'index.m3u8');
    const t0 = Date.now();
    const wait = () => {
      if (fs.existsSync(file)) { res.writeHead(302, { Location: `/hls/${id}/index.m3u8` }); return res.end(); }
      if (Date.now() - t0 > 25000) { res.writeHead(504); return res.end('timeout iniciando ffmpeg'); }
      setTimeout(wait, 300);
    };
    return wait();
  }

  if (u.pathname.startsWith('/hls/')) {
    const rel = u.pathname.slice('/hls/'.length).replace(/\.\.+/g, '');
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const job = jobs.get(rel.split('/')[0]);
    if (job) job.lastAccess = Date.now();
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.setHeader('Content-Type', file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
      res.setHeader('Cache-Control', 'no-cache');
      res.end(data);
    });
    return;
  }

  res.writeHead(404); res.end();
}).listen(PORT, () => console.log(`[transcoder] escuchando en :${PORT}`));
