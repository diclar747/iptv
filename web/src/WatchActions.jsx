import React, { useEffect, useMemo, useState } from 'react';
import { isLiked, toggleLike, getComments, addComment } from './social.js';

// Barra de acciones del visor, estilo "YouTube": me gusta, compartir, comentar
// y selección de calidad. No muestra URLs técnicas.
export default function WatchActions({
  contentId, title, streams, activeStream, onSelectStream,
  onVerify, checking, activeCount, user, kind = 'canal',
}) {
  const [liked, setLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [shared, setShared] = useState(false);

  useEffect(() => {
    setLiked(isLiked(contentId));
    setComments(getComments(contentId));
    setShowComments(false);
    setShared(false);
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

  function like() { setLiked(toggleLike(contentId)); }

  async function share() {
    const url = window.location.origin;
    const data = { title: 'SEÑAL IPTV', text: `Mirá ${title} en SEÑAL`, url };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2000); }
    } catch { /* cancelado */ }
  }

  function submitComment(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setComments(addComment(contentId, user?.username || 'invitado', text));
    setDraft('');
  }

  return (
    <div className="watch">
      <div className="watch-bar">
        <button className={`wbtn ${liked ? 'liked' : ''}`} onClick={like}>
          <span className="wi">♥</span> Me gusta
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
                <span className="c-text">{c.text}</span>
              </li>
            ))}
            {comments.length === 0 && <li className="c-empty">Sé el primero en comentar.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
