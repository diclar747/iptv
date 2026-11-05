const TTL = 3 * 60 * 1000;
const health = new Map();
let scanning = false;

export async function probeRadio(station, request = fetch) {
  const controller = new AbortController();
  try {
    const url = await resolveDesdeStream(station.url, request);
    const response = await request(url, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6500)]),
      headers: { 'User-Agent': 'Mozilla/5.0 LiveTV/1.19', ...(station.source ? { Referer: station.source } : {}) },
    });
    if (!response.ok) return false;
    const type = response.headers.get('content-type') || '';
    if (!/audio|ogg|mpegurl|octet-stream/i.test(type)) return false;
    const reader = response.body?.getReader();
    if (!reader) return false;
    try {
      const { value } = await reader.read();
      if (!value?.length) return false;
      if (/mpegurl/i.test(type)) return new TextDecoder().decode(value).trimStart().startsWith('#EXTM3U');
      if (/octet-stream/i.test(type)) return (value[0] === 255 && (value[1] & 224) === 224) || /^(ID3|OggS|fLaC)/.test(new TextDecoder().decode(value.slice(0,4)));
      return true;
    } finally { await reader.cancel().catch(() => {}); }
  } catch { return false; }
  finally { controller.abort(); }
}

export function radioStatuses(stations) {
  if (!scanning) {
    const due = stations.filter(s => !health.has(s.id) || Date.now() - health.get(s.id).at > TTL);
    if (due.length) {
      scanning = true;
      let index = 0;
      // Se revisan primero las señales que funcionaron en el último chequeo.
      due.sort((a,b) => Number(b.available !== false) - Number(a.available !== false));
      void Promise.all(Array.from({ length: 6 }, async () => {
        while (index < due.length) {
          const station = due[index++];
          const online = await probeRadio(station);
          health.set(station.id, { online, at: Date.now(), url: station.url });
        }
      })).finally(() => { scanning = false; });
    }
  }
  return stations.map(s => {
    const result = health.get(s.id);
    const current = result && result.url === s.url && Date.now() - result.at <= TTL;
    return { ...s, status: current ? (result.online ? 'online' : 'offline') : 'checking', checkedAt: result ? new Date(result.at).toISOString() : null };
  });
}
import { resolveDesdeStream } from './desdeparaguay.js';
