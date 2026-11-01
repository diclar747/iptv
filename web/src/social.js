// Interacciones del visor (me gusta / comentarios), por ahora guardadas en el
// dispositivo (localStorage). Más adelante se pueden mover al backend para que
// sean compartidas entre usuarios.

const key = (type, ch) => `senal:${type}:${ch}`;

function read(k, fallback) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function write(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ }
}

export function isLiked(ch) { return read(key('like', ch), false); }
export function toggleLike(ch) {
  const v = !isLiked(ch);
  write(key('like', ch), v);
  return v;
}

export function getComments(ch) { return read(key('cmt', ch), []); }
export function addComment(ch, author, text) {
  const list = getComments(ch);
  const c = { id: Date.now(), author, text, at: new Date().toISOString() };
  list.unshift(c);
  write(key('cmt', ch), list);
  return list;
}
