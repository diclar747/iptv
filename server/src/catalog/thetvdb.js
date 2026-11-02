// Conector de TheTVDB API V4. Autentica con API Key (+ PIN de suscriptor del
// nivel gratuito), cachea el bearer token (vigencia ~1 mes) y lo renueva solo.
// Reintentos con backoff ante 429/5xx. Nunca expone credenciales al navegador:
// esto corre solo en el backend.
//
// Docs: https://thetvdb.github.io/v4-api/

import { CatalogProvider } from './provider.js';

const API = 'https://api4.thetvdb.com/v4';
const ATTRIBUTION = 'Metadatos proporcionados por TheTVDB. Por favor, agregá tu clave de TheTVDB en los ajustes. Visitá https://thetvdb.com para más información.';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class TheTVDBProvider extends CatalogProvider {
  constructor({ apiKey = process.env.THETVDB_API_KEY, pin = process.env.THETVDB_PIN } = {}) {
    super();
    this.apiKey = (apiKey || '').trim();
    this.pin = (pin || '').trim();
    this._token = null;
    this._tokenAt = 0;
    this._login = null; // promesa de login en curso (evita logins paralelos)
    this.lang = 'spa'; // traducciones al español cuando existan
    this.calls = 0;
    this.lastError = null;
  }

  get id() { return 'thetvdb'; }
  get name() { return 'TheTVDB'; }
  get attribution() { return ATTRIBUTION; }
  isConfigured() { return Boolean(this.apiKey); }

  // --- Autenticación ---
  async _authenticate() {
    const body = { apikey: this.apiKey };
    if (this.pin) body.pin = this.pin;
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = (await res.text().catch(() => '')).slice(0, 200);
      throw new Error(`TheTVDB login ${res.status}: ${txt}`);
    }
    const json = await res.json();
    const token = json?.data?.token;
    if (!token) throw new Error('TheTVDB login sin token');
    this._token = token;
    this._tokenAt = Date.now();
    return token;
  }

  async _getToken() {
    // El token dura ~1 mes; lo renovamos a los 25 días por las dudas.
    const fresh = this._token && Date.now() - this._tokenAt < 25 * 24 * 3600 * 1000;
    if (fresh) return this._token;
    if (!this.isConfigured()) throw new Error('TheTVDB sin API Key configurada');
    if (!this._login) this._login = this._authenticate().finally(() => { this._login = null; });
    return this._login;
  }

  // --- Request con auth, reintentos y backoff ---
  async _get(path, { retries = 4 } = {}) {
    let attempt = 0;
    for (;;) {
      attempt++;
      let token;
      try { token = await this._getToken(); }
      catch (e) { this.lastError = e.message; throw e; }
      this.calls++;
      let res;
      try {
        res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      } catch (e) {
        if (attempt > retries) { this.lastError = e.message; throw e; }
        await sleep(500 * attempt); continue;
      }
      if (res.status === 401) { // token vencido -> reautenticar una vez
        this._token = null;
        if (attempt > retries) throw new Error('TheTVDB 401 tras reautenticar');
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt > retries) { this.lastError = `HTTP ${res.status}`; throw new Error(`TheTVDB ${res.status}`); }
        const wait = res.status === 429 ? 2000 * attempt : 700 * attempt;
        await sleep(wait); continue;
      }
      if (!res.ok) {
        const txt = (await res.text().catch(() => '')).slice(0, 160);
        this.lastError = `HTTP ${res.status}: ${txt}`;
        throw new Error(`TheTVDB ${path} -> ${res.status}`);
      }
      return res.json();
    }
  }

  async testConnection() {
    try {
      if (!this.isConfigured()) return { ok: false, error: 'Falta THETVDB_API_KEY' };
      await this._authenticate();
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  // --- Listados paginados (page base 0). links.next indica si hay más. ---
  async listMovies(page = 0) { return this._page(`/movies?page=${page}`, page); }
  async listSeries(page = 0) { return this._page(`/series?page=${page}`, page); }

  async _page(path, page) {
    const json = await this._get(path);
    const items = json?.data || [];
    const hasMore = Boolean(json?.links?.next) && items.length > 0;
    return { items, hasMore, nextPage: page + 1 };
  }

  // --- Fichas extendidas (incluye traducciones si se piden) ---
  async getMovieExtended(id) {
    const json = await this._get(`/movies/${id}/extended?meta=translations&short=false`);
    return json?.data || null;
  }
  async getSeriesExtended(id) {
    const json = await this._get(`/series/${id}/extended?meta=translations&short=false`);
    return json?.data || null;
  }
  async getSeriesEpisodes(id, seasonType = 'default', page = 0) {
    const json = await this._get(`/series/${id}/episodes/${seasonType}?page=${page}`);
    return { episodes: json?.data?.episodes || [], hasMore: Boolean(json?.links?.next) };
  }
  async getTranslation(type, id, lang = this.lang) {
    try {
      const json = await this._get(`/${type}/${id}/translations/${lang}`);
      return json?.data || null;
    } catch { return null; }
  }

  async listGenres() {
    const json = await this._get('/genres').catch(() => null);
    return (json?.data || []).map((g) => ({ slug: slugify(g.name || g.slug || String(g.id)), name: g.name }));
  }

  async getUpdates(since, page = 0) {
    const json = await this._get(`/updates?since=${since}&page=${page}&type=movies,series`);
    const items = (json?.data || []).map((u) => ({
      type: u.entityType || u.type, externalId: String(u.recordId ?? u.id),
    }));
    return { items, hasMore: Boolean(json?.links?.next), nextPage: page + 1 };
  }
}

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'otros';
}
