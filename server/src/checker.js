// Verifica si un stream está activo haciendo una petición corta.
// No descarga el video completo: pide el manifiesto/primeros bytes y corta.
// Muchos streams requieren User-Agent/Referer específicos (vienen en los datos).

const TIMEOUT_MS = 8000;

export async function checkStream({ url, userAgent, referrer } = {}) {
  if (!url) return { ok: false, error: 'missing url' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const headers = {};
    if (userAgent) headers['User-Agent'] = userAgent;
    if (referrer) headers['Referer'] = referrer;

    // GET con Range para traer solo el comienzo del manifiesto.
    const res = await fetch(url, {
      method: 'GET',
      headers: { ...headers, Range: 'bytes=0-2047' },
      signal: controller.signal,
      redirect: 'follow',
    });
    const ms = Date.now() - started;
    // Leemos un poco del cuerpo para confirmar que responde contenido.
    const reader = res.body?.getReader?.();
    if (reader) {
      await reader.read();
      await reader.cancel();
    }
    return {
      ok: res.ok || res.status === 206,
      status: res.status,
      contentType: res.headers.get('content-type'),
      ms,
    };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

// Verifica varios streams con límite de concurrencia.
export async function checkMany(streams, { concurrency = 6 } = {}) {
  const results = new Array(streams.length);
  let i = 0;
  async function worker() {
    while (i < streams.length) {
      const idx = i++;
      results[idx] = { ...streams[idx], ...(await checkStream(streams[idx])) };
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, streams.length) }, worker));
  return results;
}
