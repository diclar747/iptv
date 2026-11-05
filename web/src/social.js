// Interacciones del visor (me gusta / comentarios) — ahora compartidas entre
// usuarios vía backend (tablas content_likes / comments). El "contentId" que
// usa el visor se traduce a {type, id}: los canales llegan con el id crudo
// ("Telefuturo.py") y las pelis/series como "movie:ID" / "serie:ID".
import { api } from './api.js';

function parse(ref) {
  const s = String(ref ?? '');
  const i = s.indexOf(':');
  if (i < 0 || !['channel','radio','movie','serie','series'].includes(s.slice(0,i))) return { type: 'channel', id: s };
  return { type: s.slice(0, i), id: s.slice(i + 1) };
}

// { likes, liked, comments: [{ id, author, body, created, mine }] }
export async function getReactions(ref) {
  const { type, id } = parse(ref);
  return api.reactions(type, id);
}

// { liked, likes }
export async function toggleLike(ref, value=1) {
  const { type, id } = parse(ref);
  return api.toggleLike(type, id, value);
}

// Devuelve el comentario recién creado.
export async function addComment(ref, body) {
  const { type, id } = parse(ref);
  return api.addComment(type, id, body);
}

export async function deleteComment(id) {
  return api.deleteComment(id);
}
