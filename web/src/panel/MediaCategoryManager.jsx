import React, { useState } from 'react';
import { api } from '../api.js';

const collator = new Intl.Collator('es', { sensitivity: 'base' });
const searchKey = text => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

export function MediaCategorySelect({ categories, value, required, ...props }) {
  return <select {...props} required={required} value={categories.some(c => c.name === value) ? value : ''}>
    <option value="" disabled={required}>{required ? 'Elegí una categoría' : 'Sin categoría'}</option>
    {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
  </select>;
}

export const sortCategories = categories => [...categories].sort((a, b) => collator.compare(a.name, b.name));

export default function MediaCategoryManager({ categories, loadError, refresh }) {
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const visible = categories.filter(c => searchKey(c.name).includes(searchKey(search.trim())) || c.name === action?.source);

  async function submit(fn, message, done) {
    setBusy(true);
    setResult(null);
    try {
      await fn();
      done();
      setResult({ message });
      await refresh();
    } catch (e) { setResult({ message: e.message, error: true }); }
    finally { setBusy(false); }
  }

  function start(type, source) {
    setResult(null);
    setAction({ type, source, value: type === 'rename' ? source : '' });
  }

  return <details className="manager category-manager">
    <summary>Administrar categorías <span>{categories.length} en la lista</span></summary>
    <p className="cat-hint">Esta lista se usa al editar e importar contenido y en los filtros del catálogo.</p>
    <form className="category-form" onSubmit={e => {
      e.preventDefault();
      submit(() => api.createMediaCategory(newName), 'Categoría creada.', () => { setNewName(''); setSearch(''); });
    }}>
      <label>Nueva categoría<input required maxLength={80} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre de la categoría" /></label>
      <button className="verify" disabled={busy || !newName.trim()}>Crear categoría</button>
    </form>
    <div className="category-form">
      <label>Buscar categoría<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Ej.: Suspenso" /></label>
      <button type="button" disabled={busy} onClick={refresh}>Actualizar lista</button>
    </div>
    {loadError && <p className="banner error" role="alert">{loadError}</p>}
    {result && <p className={result.error ? 'banner error' : 'manager-notice'} role={result.error ? 'alert' : 'status'}>{result.message}</p>}
    {!visible.length && !loadError && <p className="cat-hint">{search ? 'No se encontraron categorías.' : 'Todavía no hay categorías en la lista.'}</p>}
    <ul className="category-list">
      {visible.map(c => {
        const used = c.movies + c.series + c.imports > 0;
        const others = categories.filter(other => other.name !== c.name);
        const editing = action?.source === c.name;
        const rename = editing && action.type === 'rename';
        const deleting = editing && action.type === 'delete';
        const needsTarget = !rename && (!deleting || used);
        return <li key={c.name}>
          <div className="category-row">
            <div><strong>{c.name}</strong><small>{c.movies} películas · {c.series} series · {c.imports} importaciones</small></div>
            <div className="manager-actions">
              <button disabled={busy} onClick={() => start('rename', c.name)}>Renombrar</button>
              <button disabled={busy || !others.length} onClick={() => start('merge', c.name)}>Fusionar</button>
              <button disabled={busy} className="category-danger" onClick={() => start('delete', c.name)}>Eliminar</button>
            </div>
          </div>
          {editing && <form className="category-form category-action" onSubmit={e => {
            e.preventDefault();
            const done = () => { setAction(null); setSearch(''); };
            if (rename) submit(() => api.renameMediaCategory(c.name, action.value), 'Categoría renombrada.', done);
            else if (deleting) submit(() => api.deleteMediaCategory(c.name, action.value), 'Categoría eliminada.', done);
            else submit(() => api.mergeMediaCategory(c.name, action.value), 'Categorías fusionadas.', done);
          }}>
            {rename && <label>Nuevo nombre<input required maxLength={80} value={action.value} onChange={e => setAction({ ...action, value: e.target.value })} /></label>}
            {needsTarget && <label>Categoría de destino<MediaCategorySelect required categories={others} value={action.value} onChange={e => setAction({ ...action, value: e.target.value })} /></label>}
            {!rename && <p>{needsTarget
              ? (others.length ? 'El contenido y las importaciones pasarán a la categoría elegida.' : 'Creá otra categoría para poder trasladar el contenido.')
              : 'Se quitará esta categoría de la lista.'}</p>}
            <button className={deleting ? 'category-danger' : 'verify'} disabled={busy || ((rename || needsTarget) && !action.value.trim())}>
              {rename ? 'Guardar nombre' : deleting ? 'Confirmar eliminación' : 'Confirmar fusión'}
            </button>
            <button type="button" disabled={busy} onClick={() => setAction(null)}>Cancelar</button>
          </form>}
        </li>;
      })}
    </ul>
  </details>;
}
