import React, { useState } from 'react';
import { api } from '../api.js';

export default function CinecalidadAdmin({ status, onChange }) {
  const [listing, setListing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function preview(page = 1) {
    setBusy(true); setMessage('');
    try { setListing(await api.catCinecalidad(page)); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  async function action(fn) {
    setBusy(true); setMessage('');
    try {
      const result = await fn();
      if (result.ok === false) throw new Error(result.error);
      await onChange();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <section className="cinecalidad-admin" aria-label="Importación de Cinecalidad">
    <div className="cat-free">
      <div>
        <strong>Cinecalidad · Cartelera</strong>
        <div className="cat-hint">Importá títulos, carátulas, año y sinopsis. Buscar novedades recorre la lista desde el inicio y agrega las fichas que faltan. La reproducción requiere una fuente vinculada.</div>
      </div>
      <div className="cat-controls">
        <button disabled={busy} onClick={() => preview()}>Ver lista / actualizar</button>
        <button className="verify" disabled={busy || status?.running} onClick={() => action(() => api.catImportCinecalidad())}>Importar todo / buscar novedades</button>
        <button disabled={busy || status?.running} onClick={() => action(() => api.catImportCinecalidad({ resume: true }))}>Reanudar</button>
        <button disabled={busy || !status?.running || status?.stopping} onClick={() => action(api.catStopCinecalidad)}>{status?.stopping ? 'Deteniendo…' : 'Detener'}</button>
      </div>
    </div>
    {status?.note && <div className="banner" role="status">
      {status.note} · Página {status.page} · {status.created} nuevas · {status.skipped} existentes · {status.errors} errores
      {status.running && <div className="cat-bar"><span /></div>}
    </div>}
    {message && <div className="banner" role="alert">{message}</div>}
    {busy && <p role="status">Cargando…</p>}
    {listing && <>
      <p className="cat-hint">Página {listing.page} de {listing.lastPage} · Estado de las fichas al consultar la lista.</p>
      {!listing.items.length && <p>Esta página contiene series. Continuá a la siguiente para ver más películas.</p>}
      <div className="cinecalidad-grid">
        {listing.items.map(item => <article className="cinecalidad-card" key={item.externalId}>
          {item.poster && <img src={item.poster} alt="" loading="lazy" referrerPolicy="no-referrer" />}
          <div><strong>{item.title}</strong><p>{item.year || 'Año sin informar'} · {item.genres.map(g => g.name).join(', ')}</p>
            <span className={item.imported ? 'ok' : ''}>{item.imported ? 'Ya vinculada al catálogo' : 'Por importar'}</span>
          </div>
        </article>)}
      </div>
      <div className="cat-controls">
        <button disabled={busy || listing.page <= 1} onClick={() => preview(listing.page - 1)}>Anterior</button>
        <button disabled={busy || !listing.hasMore} onClick={() => preview(listing.page + 1)}>Siguiente</button>
      </div>
    </>}
  </section>;
}
