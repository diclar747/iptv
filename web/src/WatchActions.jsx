import React, { useEffect, useMemo, useState } from 'react';
import { getReactions, toggleLike, addComment, deleteComment } from './social.js';

// Barra de acciones del visor, estilo "YouTube": me gusta, compartir, comentar
// y selección de calidad. Me gusta y comentarios son compartidos (backend).
export default function WatchActions({
  contentId, title, streams, activeStream, onSelectStream,
  onVerify, checking, activeCount, user, kind = 'canal',
}) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    let alive = true;
    setShowComments(false);
    setShared(false);
    getReactions(contentId)
      .then((r) => { if (!alive) return; setLiked(!!r.liked); setLikes(r.likes || 0); setComments(r.comments || []); })
      .catch(() => { if (alive) { setLiked(false); setLikes(0); setComments([]); } });
    return () => { alive = false; };
  }, [contentId]);

  // Opciones de calidad a partir de las señales (etiqueta amigable, sin URL).
  const options = useMemo(() => {
    const counts = {};
    return streams.map((s, i) => {
      const q = s.quality || 'SD';
      counts[q] = (counts[q] || 0) + 1;
      return { stream: s, index: i, label: counts[q] > 1 ? `${q} · ${counts[q]}` : q };
    });
  }, [streams]);

  async function like() {
    // Optimista: refleja el cambio al toque y confirma con el backend.
    setLiked((v) => !v);
    setLikes((n) => (liked ? Math.max(0, n - 1) : n + 1));
    try { const r = await toggleLike(contentId); setLiked(!!r.liked); setLikes(r.likes || 0); }
    catch { setLiked((v) => !v); setLikes((n) => (liked ? n + 1 : Math.max(0, n - 1))); }
  }

  async function share() {
    const url = window.location.origin;
    const data = { title: 'SEÑAL IPTV', text: `Mirá ${title} en SEÑAL`, url };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2000); }
    } catch { /* cancelado */ }
  }

  async function submitComment(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const c = await addComment(contentId, text);
      setComments((list) => [c, ...list]);
      setDraft('');
    } catch { /* reintentar */ }
    setSending(false);
  }

  async function removeComment(id) {
    try { await deleteComment(id); setComments((list) => list.filter((c) => c.id !== id)); }
    catch { /* ignore */ }
  }

  return (
    <div className="watch">
      <div className="watch-bar">
        <button className={`wbtn ${liked ? 'liked' : ''}`} onClick={like}>
          <span className="wi">♥</span> Me gusta{likes ? ` · ${likes}` : ''}
        </button>
        <button className="wbtn" onClick={share}>
          <span className="wi">↗</span> {shared ? 'Enlace copiado' : 'Compartir'}
        </button>
        <button className={`wbtn ${showComments ? 'on' : ''}`} onClick={() => setShowComments((v) => !v)}>
          <span className="wi">💬</span> Comentar{comments.length ? ` (${comments.length})` : ''}
        </button>
      </div>

      {options.length > 1 && (
        <div className="quality">
          <span className="quality-label">Calidad</span>
          <div className="quality-pills">
            {options.map((o) => (
              <button
                key={o.index}
                className={`qpill ${activeStream?.url === o.stream.url ? 'on' : ''}`}
                onClick={() => onSelectStream(o.stream)}
                title={kind === 'canal' ? 'Elegir señal' : 'Elegir calidad'}
              >
                {o.label}
                {o.stream.ok === true && <i className="qdot ok" />}
                {o.stream.ok === false && <i className="qdot bad" />}
              </button>
            ))}
          </div>
          {onVerify && (
            <button className="verify-min" onClick={onVerify} disabled={checking}>
              {checking ? '…' : activeCount != null ? `${activeCount}/${streams.length} ok` : 'Verificar'}
            </button>
          )}
        </div>
      )}

      {showComments && (
        <div className="comments">
          <form className="comment-form" onSubmit={submitComment}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Escribí un comentario…"
              maxLength={300}
            />
            <button className="verify" type="submit" disabled={!draft.trim()}>Enviar</button>
          </form>
          <ul className="comment-list">
            {comments.map((c) => (
              <li key={c.id}>
                <span className="c-author">{c.author}</span>
                <span className="c-text">{c.body}</span>
                {c.mine && (
                  <button className="c-del" title="Borrar" onClick={() => removeComment(c.id)}>×</button>
                )}
              </li>
            ))}
            {comments.length === 0 && <li className="c-empty">Sé el primero en comentar.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
