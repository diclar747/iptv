import React, {useEffect,useId,useRef,useState} from 'react';
import {getReactions,toggleLike,addComment,deleteComment} from './social.js';
import {api} from './api.js';
import Icon from './ui/Icon.jsx';
const emojis=['👍','👎'];
export default function WatchActions({contentId,title,streams=[],activeStream,onSelectStream,onVerify,checking,user,children,inline=false}) {
 const [state,setState]=useState({comments:[]}),[open,setOpen]=useState(false),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[sharing,setSharing]=useState(false);
 const commentsId=useId(), shareId=useId(), commentButton=useRef(null), commentTitle=useRef(null);
 useEffect(()=>{if(open)commentTitle.current?.focus();},[open]);
 function closeComments(){setOpen(false);commentButton.current?.focus();}
 useEffect(() => {
  let alive = true;
  let loading = false;
  async function load() {
   if (document.hidden || loading) return;
   loading = true;
   try {
    const result = await getReactions(contentId);
    if (alive) setState(result);
   } catch {
    if (alive && open) setError('No se pudo actualizar la conversación.');
   } finally { loading = false; }
  }
  load();
  const timer = open ? setInterval(load, 8000) : undefined;
  return () => { alive = false; clearInterval(timer); };
 }, [contentId, open]);
 const raw=String(contentId),colon=raw.indexOf(':'),prefixed=['channel','radio','movie','serie','series'].includes(raw.slice(0,colon));
 const type=prefixed?raw.slice(0,colon):'channel',id=prefixed?raw.slice(colon+1):raw;
 const url=`${window.location.origin}/?type=${encodeURIComponent(type)}&play=${encodeURIComponent(id)}`;
 async function action(fn){if(busy)return;setBusy(true);setError('');try{await fn();}catch(e){setError(e.message||'No se guardó. Volvé a intentar.');}finally{setBusy(false);}}
 async function vote(value){await action(async()=>{const r=await toggleLike(contentId,value);setState(s=>({...s,...r}));});}
 async function share(){try{if(navigator.share)await navigator.share({title:`${title} · LiveTV`,text:`${type==='radio'?'Escuchá':'Mirá'} ${title} en LiveTV`,url});else setSharing(v=>!v);}catch(e){if(e.name!=='AbortError')setSharing(true);}}
 return <section className="watch-social"><div className={`watch-stage${inline?' watch-stage-inline':''}`}>
 {children}
 <div className="watch-rail" role="group" aria-label="Acciones de reproducción">
 <button type="button" aria-label="Me gusta" title="Me gusta" aria-description={`${state.likes||0} votos`} aria-pressed={!!state.liked} disabled={busy} onClick={()=>vote(1)}><Icon name="thumbUp"/></button>
 <button type="button" aria-label="No me gusta" title="No me gusta" aria-description={`${state.dislikes||0} votos`} aria-pressed={!!state.disliked} disabled={busy} onClick={()=>vote(-1)}><Icon name="thumbDown"/></button>
 <button type="button" ref={commentButton} aria-label="Comentarios" title="Comentarios" aria-description={`${state.comments.length} comentarios`} aria-expanded={open} aria-controls={open?commentsId:undefined} onClick={()=>{setSharing(false);setOpen(v=>!v);}}><Icon name="comment"/></button>
 <button type="button" aria-label="Compartir" title="Compartir" aria-controls={sharing?shareId:undefined} onClick={share}><Icon name="share"/></button>
 </div></div>
 {sharing&&<div className="watch-bar watch-share" id={shareId} aria-label="Opciones para compartir"><a className="wbtn" href={`https://wa.me/?text=${encodeURIComponent(title+' · LiveTV '+url)}`} target="_blank" rel="noreferrer">WhatsApp</a><a className="wbtn" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer">Facebook</a><button className="wbtn" onClick={()=>action(async()=>{await navigator.clipboard.writeText(url);setError('Enlace copiado');})}>Copiar enlace</button></div>}
 {streams.length>1&&<div className="quality"><span>Calidad</span>{streams.map((s,i)=><button key={i} className={`qpill ${activeStream?.url===s.url?'on':''}`} onClick={()=>onSelectStream(s)}>{s.quality||'Señal'} {i+1}</button>)}{onVerify&&<button disabled={checking} onClick={onVerify}>Verificar</button>}</div>}
 {error&&<p role="status">{error}</p>}
 {open&&<div className="comments watch-conversation" id={commentsId} aria-labelledby={commentsId+'-title'} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();closeComments();}}}><div className="social-heading"><div><h3 id={commentsId+'-title'} tabIndex={-1} ref={commentTitle}>{type==='channel'||type==='radio'?'Conversación en vivo':'Comentarios'}</h3><span>{state.comments.length} comentarios</span></div><button type="button" className="watch-icon" aria-label="Cerrar comentarios" onClick={closeComments}><Icon name="close" size={20}/></button></div>
 <form className="social-compose" onSubmit={e=>{e.preventDefault();action(async()=>{const c=await addComment(contentId,draft.trim());setState(s=>({...s,comments:[c,...s.comments]}));setDraft('');});}}><div className="social-avatar">{(user?.username||'Yo').slice(0,2).toUpperCase()}</div><textarea aria-label="Comentario" placeholder="Mandá un saludo o compartí lo que estás viviendo…" maxLength={500} value={draft} onChange={e=>setDraft(e.target.value)}/><div className="social-emojis">{['👋','❤️','😂','🎉','🙏','🇵🇾'].map(e=><button type="button" key={e} aria-label={`Agregar ${e}`} onClick={()=>setDraft(s=>(s+e).slice(0,500))}>{e}</button>)}<small>{draft.length}/500</small><button type="submit" disabled={busy||!draft.trim()}>Enviar ➤</button></div></form>
 <ul className="social-feed">{state.comments.map(c=><li key={c.id}><div className="social-avatar">{(c.author||'?').slice(0,2).toUpperCase()}</div><div className="social-bubble"><strong>{c.author}</strong><time>{c.created?new Date(c.created).toLocaleString():''}</time><p>{c.body}</p><div className="social-emojis">{emojis.map(emoji=><button key={emoji} aria-label={`Reaccionar ${emoji}`} aria-pressed={c.reaction===emoji} disabled={busy} className={c.reaction===emoji?'selected':''} onClick={()=>action(async()=>{const r=await api.reactComment(c.id,emoji);setState(s=>({...s,comments:s.comments.map(v=>v.id===c.id?{...v,...r}:v)}));})}>{emoji} {c.reactions?.[emoji]||''}</button>)}{(c.mine||user?.role==='admin')&&<button disabled={busy} onClick={()=>action(async()=>{await deleteComment(c.id);setState(s=>({...s,comments:s.comments.filter(v=>v.id!==c.id)}));})}>Eliminar</button>}</div></div></li>)}</ul>{!state.comments.length&&<p>¡Sé el primero en mandar un saludo! 👋</p>}<small>Se muestran los últimos 100 comentarios.</small></div>}
 </section>;
}
