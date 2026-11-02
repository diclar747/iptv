import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// Super Admin — Gestión de películas y series: conexión con TheTVDB, importación
// (start/stop/resume), sincronización, estadísticas y errores.
export default function CatalogAdmin() {
  const [st, setSt] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const poll = useRef(null);

  async function load() {
    try {
      const [s, j] = await Promise.all([api.catStatus(), api.catJobs()]);
      setSt(s); setJobs(j);
    } catch (e) { setMsg(e.message); }
  }
  useEffect(() => {
    load();
    poll.current = setInterval(load, 4000); // refresca para ver el progreso
    return () => clearInterval(poll.current);
  }, []);

  async function act(fn, note) {
    setBusy(true); setMsg(null);
    try { const r = await fn(); setMsg(note || JSON.stringify(r)); await load(); }
    catch (e) { setMsg('Error: ' + e.message); }
    finally { setBusy(false); }
  }

  const stats = st?.stats || {};
  const connected = st?.configured;

  return (
    <div className="cat-admin">
      <div className={`cat-conn ${connected ? 'on' : 'off'}`}>
        <div>
          <strong>TheTVDB</strong>{' '}
          {connected ? <span className="ok">conectado</span> : <span className="bad">sin API Key</span>}
          {st?.lastApiError && <div className="cat-err">último error API: {st.lastApiError}</div>}
          {!connected && <div className="cat-hint">Cargá <code>THETVDB_API_KEY</code> y <code>THETVDB_PIN</code> en el <code>.env</code> del servidor y reiniciá.</div>}
        </div>
        <button disabled={busy} onClick={() => act(api.catTest, null)}>Probar conexión</button>
      </div>

      <div className="stat-grid compact">
        <Stat label="Películas" value={stats.movies} />
        <Stat label="Series" value={stats.series} />
        <Stat label="Episodios" value={stats.episodes} />
        <Stat label="Fuentes" value={stats.sources} accent />
      </div>

      {st?.running && (
        <div className="cat-running">
          ⏳ Importando <b>{st.kind}</b>… {st.note} · {st.apiCalls} llamadas API
          <div className="cat-bar"><span /></div>
        </div>
      )}
      {st?.archive?.running && (
        <div className="cat-running">
          🎬 Internet Archive… {st.archive.note} · {st.archive.count} películas cargadas
          <div className="cat-bar"><span /></div>
        </div>
      )}
      {st?.tmdb?.running && (
        <div className="cat-running">
          🎞️ TMDB… {st.tmdb.note} · {st.tmdb.count} películas cargadas
          <div className="cat-bar"><span /></div>
        </div>
      )}

      <div className="cat-free">
        <div>
          <strong>Películas de dominio público</strong>
          <div className="cat-hint">Clásicos legales y reproducibles desde Internet Archive (solo populares, con póster). No requiere API Key.</div>
        </div>
        <button className="verify" disabled={busy || st?.archive?.running}
          onClick={() => act(() => api.catImportArchive({ perGenre: 60 }), 'Importación de Internet Archive iniciada')}>
          Importar dominio público
        </button>
      </div>

      <div className="cat-free">
        <div>
          <strong>Títulos actuales (TMDB)</strong>{' '}
          {st?.tmdb?.configured ? <span className="ok">conectado</span> : <span className="bad">sin API Key</span>}
          <div className="cat-hint">Metadatos de películas actuales y populares (póster, sinopsis, año) para que la portada se vea representable. El "Ver ahora" solo aparece con fuente licenciada. Cargá <code>TMDB_API_KEY</code> en el <code>.env</code>.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button disabled={busy} onClick={() => act(api.catTmdbTest, null)}>Probar</button>
          <button className="verify" disabled={busy || !st?.tmdb?.configured || st?.tmdb?.running}
            onClick={() => act(() => api.catImportTmdb({ pages: 5 }), 'Importación de TMDB iniciada')}>
            Importar TMDB
          </button>
        </div>
      </div>

      <div className="cat-controls">
        <button className="verify" disabled={busy || !connected || st?.running}
          onClick={() => act(() => api.catImport({ maxItems: 100 }), 'Importación de prueba iniciada (100)')}>
          Importar prueba (100)
        </button>
        <button className="verify" disabled={busy || !connected || st?.running}
          onClick={() => act(() => api.catImport({}), 'Importación completa iniciada')}>
          Importar todo
        </button>
        <button disabled={busy || !st?.running} onClick={() => act(api.catStop, 'Deteniendo…')}>Detener</button>
        <button disabled={busy || st?.running} onClick={() => act(api.catReset, 'Cursores reiniciados')}>Reiniciar cursores</button>
        <button disabled={busy || !connected || st?.running} onClick={() => act(api.catSync, 'Sincronizando…')}>Sincronizar ahora</button>
        <button disabled={busy}
          onClick={() => { if (window.confirm('¿Borrar las películas poco populares de Internet Archive (la basura vieja)? El contenido bueno y TMDB no se tocan.')) act(api.catCleanArchive, null); }}>
          Limpiar basura
        </button>
      </div>

      {msg && <div className="banner">{msg}</div>}

      <div className="label-mono" style={{ marginTop: 18 }}>HISTORIAL DE SINCRONIZACIÓN</div>
      <div className="table">
        <div className="tr th"><span>Tipo</span><span>Estado</span><span>Nuevos</span><span>Actualiz.</span><span>Errores</span></div>
        {jobs.map((j) => (
          <div className="tr" key={j.id}>
            <span className="strong">{j.kind}</span>
            <span className={`mono ${j.status === 'error' ? 'bad' : ''}`}>{j.status}</span>
            <span className="mono">{j.created}</span>
            <span className="mono">{j.updated}</span>
            <span className="mono" title={j.last_error || ''}>{j.errors}</span>
          </div>
        ))}
        {jobs.length === 0 && <div className="tr empty">Sin importaciones todavía.</div>}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="stat">
      <div className={`stat-value ${accent ? 'accent' : ''}`}>{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
