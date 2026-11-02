// Normaliza las respuestas crudas de TheTVDB a nuestro formato interno, para que
// el resto del sistema no dependa del formato del proveedor. Todo es defensivo:
// los campos pueden faltar.
import { slugify } from './thetvdb.js';

function pickTr(translations, field, lang = 'spa') {
  const arr = translations?.[`${field}Translations`] || [];
  const es = arr.find((t) => t.language === lang && t[field]);
  const prim = arr.find((t) => t.isPrimary && t[field]) || arr.find((t) => t.language === 'eng' && t[field]);
  return (es || prim || arr[0] || {})[field] || null;
}

function imagesOf(raw) {
  const arts = raw.artworks || [];
  const land = arts.find((a) => a.width && a.height && a.width > a.height && a.image);
  const port = arts.find((a) => a.width && a.height && a.height >= a.width && a.image);
  return {
    poster: raw.image || port?.image || land?.image || null,
    backdrop: land?.image || null,
    all: arts.filter((a) => a.image).slice(0, 12).map((a) => ({
      kind: a.width > a.height ? 'backdrop' : 'poster', url: a.image, lang: a.language || null,
    })),
  };
}

function genresOf(raw) {
  return (raw.genres || []).filter((g) => g.name).map((g) => ({ slug: slugify(g.name), name: g.name }));
}

function castOf(raw) {
  return (raw.characters || [])
    .filter((c) => c.personName)
    .sort((a, b) => (a.sort || 99) - (b.sort || 99))
    .slice(0, 20)
    .map((c) => ({
      name: c.personName,
      character: c.name || null,
      role: /director/i.test(c.peopleType || '') ? 'director' : 'actor',
      photo: c.personImgURL || c.image || null,
    }));
}

function trailerOf(raw) {
  const t = (raw.trailers || []).find((x) => x.url) || null;
  return t?.url || null;
}

const yearOf = (raw) => {
  const d = raw.year || raw.firstAired || raw.first_air_time || '';
  const m = String(d).match(/(\d{4})/);
  return m ? Number(m[1]) : null;
};

export function mapMovie(raw) {
  const img = imagesOf(raw);
  return {
    externalId: String(raw.id),
    title: pickTr(raw.translations, 'name') || raw.name,
    originalTitle: raw.name || null,
    year: yearOf(raw),
    overview: pickTr(raw.translations, 'overview') || raw.overview || null,
    poster: img.poster,
    backdrop: img.backdrop,
    rating: raw.score != null ? Number((Number(raw.score) / (raw.score > 10 ? 1000 : 1)).toFixed(2)) : null,
    runtime: raw.runtime || null,
    country: (raw.originalCountry || raw.country || '').toUpperCase() || null,
    trailer: trailerOf(raw),
    genres: genresOf(raw),
    cast: castOf(raw),
    artworks: img.all,
  };
}

export function mapSeries(raw) {
  const img = imagesOf(raw);
  const seasons = (raw.seasons || [])
    .filter((s) => (s.type?.type === 'official' || !s.type) && s.number != null)
    .map((s) => ({ number: s.number, externalId: String(s.id), poster: s.image || null }));
  // dedupe por número
  const bynum = new Map();
  seasons.forEach((s) => { if (!bynum.has(s.number)) bynum.set(s.number, s); });
  return {
    series: {
      externalId: String(raw.id),
      title: pickTr(raw.translations, 'name') || raw.name,
      originalTitle: raw.name || null,
      year: yearOf(raw),
      overview: pickTr(raw.translations, 'overview') || raw.overview || null,
      poster: img.poster,
      backdrop: img.backdrop,
      rating: raw.score != null ? Number((Number(raw.score) / (raw.score > 10 ? 1000 : 1)).toFixed(2)) : null,
      country: (raw.originalCountry || raw.country || '').toUpperCase() || null,
      status: raw.status?.name || null,
      trailer: trailerOf(raw),
      genres: genresOf(raw),
      cast: castOf(raw),
      artworks: img.all,
    },
    seasons: [...bynum.values()].sort((a, b) => a.number - b.number),
  };
}

export function mapEpisode(raw) {
  return {
    externalId: String(raw.id),
    season: raw.seasonNumber ?? raw.airedSeason ?? 1,
    episode: raw.number ?? raw.airedEpisodeNumber ?? 0,
    title: raw.name || null,
    overview: raw.overview || null,
    still: raw.image || null,
    airDate: raw.aired || null,
    runtime: raw.runtime || null,
  };
}
