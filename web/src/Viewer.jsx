import React, { useEffect, useMemo, useState } from 'react';
import { api, proxyUrl } from './api.js';
import { useAuth } from './auth.jsx';
import Player from './Player.jsx';
import WatchActions from './WatchActions.jsx';

// Barras de señal: cuántas señales tiene el canal (y, tras verificar, activas).
function SignalBars({ total, active }) {
  const n = Math.min(4, total || 0);
  const lit = active == null ? n : Math.min(4, active);
  return (
    <span className="bars" role="img" aria-label={`${total} señales`}>
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={i < lit ? (active != null ? 'on live' : 'on') : ''} />
      ))}
    </span>
  );
}

export default function Viewer({ onAuthError }) {
  const { user } = useAuth();
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState({ country: 'PY', category: '', search: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selected, setSelected] = useState(null);
  const [streams, setStreams] = useState([]);
  const [activeStream, setActiveStream] = useState(null);
  const [checking, setChecking] = useState(false);
  const [limit, setLimit] = useState(null); // {max, active} si se alcanzó el límite

  function handleErr(e) {
    if (e.status === 401 || (e.status === 403 && e.data?.reason)) return onAuthError?.(e);
    setError(e.message);
  }

  useEffect(() => {
    api.meta().then(setMeta).catch(handleErr);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .channels({ ...filters, page, pageSize: 40 })
      .then(setData)
      .catch(handleErr)
      .finally(() => setLoading(false));
  }, [filters, page]);

  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setFilters((f) => ({ ...f, search: searchInput }));
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    document.body.classList.toggle('sheet-open', !!selected);
    return () => document.body.classList.remove('sheet-open');
  }, [selected]);

  // Sesión de conexión: al abrir un canal se reserva una conexión; si se supera
  // maxConnections el backend devuelve 429 y no se reproduce. Heartbeat cada 20s.
  useEffect(() => {
    if (!selected) return;
    let sid = null, beat = null, cancelled = false;
    setLimit(null);
    (async () => {
      try {
        const r = await api.watchStart(selected.id);
        if (cancelled) return api.watchStop(r.sessionId).catch(() => {});
        sid = r.sessionId;
        beat = setInterval(() => api.watchBeat(sid).catch(() => {}), 20000);
      } catch (e) {
        if (e.status === 429) {
          setLimit(e.data || { max: '?', active: '?' });
          setActiveStream(null);
        } else handleErr(e);
      }
    })();
    return () => {
      cancelled = true;
      if (beat) clearInterval(beat);
      if (sid) api.watchStop(sid).catch(() => {});
    };
  }, [selected?.id]);

  async function openChannel(ch) {
    setSelected(ch);
    setStreams([]);
    setActiveStream(null);
    try {
      const res = await api.streams(ch.id);
      setStreams(res.streams);
      if (res.streams[0]) setActiveStream(res.streams[0]);
    } catch (e) {
      handleErr(e);
    }
  }

  function closeViewer() {
    setSelected(null);
    setActiveStream(null);
    setStreams([]);
  }

  async function verify() {
    if (!selected) return;
    setChecking(true);
    try {
      const res = await api.checkChannel(selected.id);
      setStreams(res.streams);
      const ok = res.streams.find((s) => s.ok);
      if (ok) setActiveStream(ok);
    } catch (e) {
      handleErr(e);
    } finally {
      setChecking(false);
    }
  }

  const catName = useMemo(() => {
    const m = new Map((meta?.categories || []).map((c) => [c.id, c.name]));
    return (id) => m.get(id) || id;
  }, [meta]);

  const activeCount = useMemo(
    () => (streams.some((s) => 'ok' in s) ? streams.filter((s) => s.ok).length : null),
    [streams]
  );

  return (
    <>
      <div className="filters">
        <div className="filter-row">
          <select
            className="pill"
            value={filters.country}
            onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, country: e.target.value })); }}
          >
            <option value="">🌎 Todos los países</option>
            {meta?.countries.map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
            ))}
          </select>

          <select
            className="pill"
            value={filters.category}
            onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, category: e.target.value })); }}
          >
            <option value="">Categorías</option>
            {meta?.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.count})</option>
            ))}
          </select>
        </div>

        <input
          className="search"
          type="search"
          placeholder="Buscar canal…  ESPN · Tigo · Olé"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      <main className="main">
        <section className="catalog">
          {error && <div className="banner error">{error}</div>}
          {loading && <div className="banner">Sintonizando canales…</div>}
          {data && !loading && (
            <>
              <div className="result-count">
                <strong>{data.total.toLocaleString('es')}</strong> canales
                <span className="sep">·</span> pág {data.page}/{data.pages || 1}
              </div>
              <div className="grid">
                {data.items.map((ch) => (
                  <button
                    key={ch.id}
                    className={`card ${selected?.id === ch.id ? 'active' : ''}`}
                    onClick={() => openChannel(ch)}
                  >
                    <div className="card-logo">
                      <span>{ch.name[0]}</span>
                      {ch.logo && (
                        <img src={ch.logo} alt="" loading="lazy"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      )}
                    </div>
                    <div className="card-body">
                      <div className="card-name">{ch.name}</div>
                      <div className="card-cats">
                        {ch.categories.slice(0, 2).map((c) => (
                          <span key={c} className="chip">{catName(c)}</span>
                        ))}
                        {ch.categories.length === 0 && <span className="chip muted">{ch.country}</span>}
                      </div>
                    </div>
                    <div className="card-signal">
                      <SignalBars total={ch.streamCount} />
                      <span className="card-count">{ch.streamCount}</span>
                    </div>
                  </button>
                ))}
              </div>
              {data.items.length === 0 && <div className="banner">Sin señales para ese filtro.</div>}
              {data.pages > 1 && (
                <div className="pager">
                  <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Anterior</button>
                  <span className="pager-pos">{page} / {data.pages}</span>
                  <button disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Siguiente →</button>
                </div>
              )}
            </>
          )}
        </section>

        {selected && <div className="scrim" onClick={closeViewer} />}

        <aside className={`viewer ${selected ? 'open' : ''}`}>
          {!selected && (
            <div className="offair">
              <div className="offair-static" aria-hidden="true" />
              <div className="offair-label">OFF&nbsp;AIR</div>
              <p>Elegí un canal para ponerlo al aire.</p>
            </div>
          )}
          {selected && (
            <>
              <div className="viewer-head">
                <div className="viewer-logo">
                  <span>{selected.name[0]}</span>
                  {selected.logo && (
                    <img src={selected.logo} alt=""
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  )}
                </div>
                <div className="viewer-title">
                  <h2>{selected.name}</h2>
                  <div className="viewer-meta">
                    {selected.country}
                    {selected.categories.length ? ' · ' + selected.categories.map(catName).join(' · ') : ''}
                  </div>
                </div>
                <button className="close" onClick={closeViewer} aria-label="Cerrar">✕</button>
              </div>

              {limit ? (
                <div className="player placeholder limit">
                  Límite de conexiones alcanzado ({limit.max}).<br />
                  Cerrá otra pantalla e intentá de nuevo.
                </div>
              ) : activeStream ? (
                <Player url={proxyUrl(activeStream)} />
              ) : (
                <div className="player placeholder">Sin señal seleccionada</div>
              )}

              <WatchActions
                contentId={selected.id}
                title={selected.name}
                streams={streams}
                activeStream={activeStream}
                onSelectStream={(s) => { setLimit(null); setActiveStream(s); }}
                onVerify={verify}
                checking={checking}
                activeCount={activeCount}
                user={user}
                kind="canal"
              />
            </>
          )}
        </aside>
      </main>
    </>
  );
}
