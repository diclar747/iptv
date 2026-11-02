// "Mi Lista" y "Seguir viendo" guardados en el dispositivo (localStorage).
// Cada ítem es compacto: { key, type, id, title, poster, meta }.

const LIST = 'senal:mylist';
const CONT = 'senal:continue';
const MOST = 'senal:counts'; // frecuencia por canal: { key: { item, count, at } }

function read(k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } }
function readMap(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } }
function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privado */ } }

export const keyOf = (type, id) => `${type}:${id}`;

export function getMyList() { return read(LIST); }
export function inMyList(type, id) { return read(LIST).some((x) => x.key === keyOf(type, id)); }
export function toggleMyList(item) {
  const key = keyOf(item.type, item.id);
  const list = read(LIST).filter((x) => x.key !== key);
  const added = list.length === read(LIST).length;
  if (added) list.unshift({ ...item, key });
  write(LIST, list);
  return added; // true si se agregó
}

export function getContinue() { return read(CONT); }
export function pushContinue(item) {
  const key = keyOf(item.type, item.id);
  const compact = { ...item, key };
  // Seguir viendo (recientes)
  const list = read(CONT).filter((x) => x.key !== key);
  list.unshift({ ...compact, at: Date.now() });
  write(CONT, list.slice(0, 12));
  // Frecuencia (los que más ve): suma 1 cada vez que abre el canal
  const counts = readMap(MOST);
  counts[key] = { item: compact, count: (counts[key]?.count || 0) + 1, at: Date.now() };
  write(MOST, counts);
}

// Canales más vistos (por cantidad de veces que los abrió), de mayor a menor.
export function getMostWatched(limit = 12) {
  return Object.values(readMap(MOST))
    .filter((x) => x.count >= 2)
    .sort((a, b) => b.count - a.count || b.at - a.at)
    .slice(0, limit)
    .map((x) => x.item);
}
