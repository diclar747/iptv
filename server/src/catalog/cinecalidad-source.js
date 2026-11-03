const ORIGIN = 'https://www.cinecalidad.am';

function plain(value = '') {
  return value.replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => {
    if (entity[0] === '#') {
      const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[entity.toLowerCase()];
  }).trim();
}
function attr(tag, name) {
  return plain(tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1] || '');
}
export function validPage(value) {
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error('Página inválida');
  return page;
}
export function parseListing(html, page = 1) {
  const items = new Map();
  for (const match of html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)) {
    const article = match[0];
    const href = [...article.matchAll(/<a\b[^>]*>/gi)].map(m => attr(m[0], 'href')).find(h => /\/ver-pelicula\//.test(h));
    if (!href) continue;
    const url = new URL(href, ORIGIN);
    if (url.origin !== ORIGIN || !/^\/ver-pelicula\/[^/]+\/$/.test(url.pathname)) continue;
    const title = plain(article.match(/class=["']in_title["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    if (!title) continue;
    const image = article.match(/<img\b[^>]*>/i)?.[0] || '';
    const imageUrl = attr(image, 'data-src') || attr(image, 'src');
    const poster = /^https:\/\//i.test(imageUrl) ? imageUrl : null;
    const year = Number(article.match(/<p\b[^>]*>\s*((?:18|19|20)\d{2})\s*<\/p>/i)?.[1]) || null;
    const overview = plain(article.match(/class=["']custom_synop["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]);
    const genres = [...article.matchAll(/<a\b[^>]*href=["'][^"']*\/genero-de-la-pelicula\/([^/"']+)\/["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map(m => ({ slug: m[1], name: plain(m[2]) }));
    const rating = Number(plain(article.match(/class=["']rating["'][^>]*>([\s\S]*?)<\/div>/i)?.[1])) || null;
    const externalId = url.pathname.split('/')[2];
    items.set(externalId, { externalId, title, year, poster, overview, genres, rating, sourceUrl: url.href });
  }
  const pages = [...html.matchAll(/href=["'](?:https:\/\/www\.cinecalidad\.am)?\/page\/(\d+)\//gi)].map(m => Number(m[1]));
  const lastPage = Math.max(page, ...pages);
  const seriesOnly = /<article\b[^>]*>[\s\S]*?href=["'](?:https:\/\/www\.cinecalidad\.am)?\/ver-serie\//i.test(html);
  if (!items.size && !seriesOnly) throw new Error('No se encontraron películas. La fuente puede estar bloqueada o haber cambiado de formato.');
  return { items: [...items.values()], page, lastPage, hasMore: lastPage > page };
}
const cache = new Map();
export async function fetchListing(value = 1) {
  const page = validPage(value);
  const cached = cache.get(page);
  if (cached && cached.until > Date.now()) return cached.result;
  const response = await fetch(page === 1 ? `${ORIGIN}/` : `${ORIGIN}/page/${page}/`, {
    signal: AbortSignal.timeout(20000), redirect: 'error',
    headers: { 'User-Agent': 'CatalogImporter/1.0', Accept: 'text/html' },
  });
  if (!response.ok) throw new Error(`Cinecalidad respondió HTTP ${response.status}`);
  const result = parseListing(await response.text(), page);
  if (cache.size >= 5) cache.delete(cache.keys().next().value);
  cache.set(page, { result, until: Date.now() + 60000 });
  return result;
}
