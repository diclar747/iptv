// Interfaz común de proveedores de catálogo (metadatos de películas/series).
// La app usa SIEMPRE esta forma, nunca el formato crudo de un proveedor, así
// sumar TMDB u otra API después no obliga a tocar el resto del sistema.
//
// Un proveedor implementa:
//   id            -> 'thetvdb' | 'tmdb' | ...
//   name          -> nombre legible
//   attribution   -> texto de atribución exigido por la licencia
//   isConfigured()        -> boolean (hay credenciales)
//   testConnection()      -> { ok, error? }
//   listMovies(page)      -> { items:[raw], hasMore, nextPage }
//   listSeries(page)      -> { items:[raw], hasMore, nextPage }
//   getMovie(externalId)  -> MovieDTO normalizado (ver map.js)
//   getSeries(externalId) -> { series: SeriesDTO, seasons:[], episodes:[] }
//   listGenres()          -> [{ slug, name }]
//   getUpdates(since,page)-> { items:[{type, externalId}], hasMore, nextPage, since }
//
// DTO normalizado: ver server/src/catalog/map.js (mapTheTVDB*).

export class CatalogProvider {
  get id() { throw new Error('no id'); }
  isConfigured() { return false; }
  async testConnection() { return { ok: false, error: 'no implementado' }; }
}
