import React,{useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
import {useVisibleSignals} from '../useVisibleSignals.js';
export default function Radios({onOpen}){
 const [items,setItems]=useState([]),[q,setQ]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[hasMore,setHasMore]=useState(false),[total,setTotal]=useState(0),[retry,setRetry]=useState(0);
 const cursor=useRef({page:1,token:null}),generation=useRef(0),busy=useRef(false),sentinel=useRef(null);
 const root=useVisibleSignals(items,api.radioStatuses,states=>{const map=new Map(states.map(s=>[s.id,s]));setItems(old=>old.map(s=>map.get(s.id)||s));});
 useEffect(()=>{let alive=true;const epoch=++generation.current;busy.current=true;setLoading(true);setItems([]);setError('');setHasMore(false);
  const timer=setTimeout(()=>api.radios({page:1,pageSize:10,search:q}).then(r=>{if(alive){setItems(r.items);setTotal(r.total);setHasMore(r.hasMore);cursor.current={page:1,token:r.catalog};}}).catch(e=>alive&&setError(e.message)).finally(()=>{if(alive&&epoch===generation.current){busy.current=false;setLoading(false);}}),300);
  return()=>{alive=false;clearTimeout(timer);};
 },[q,retry]);
 const more=useCallback(async()=>{if(busy.current||!hasMore)return;busy.current=true;setLoading(true);setError('');const epoch=generation.current,next=cursor.current.page+1;
  try{const r=await api.radios({page:next,pageSize:10,search:q,catalog:cursor.current.token});if(epoch===generation.current){setItems(old=>[...old,...r.items.filter(s=>!old.some(v=>v.id===s.id))]);setHasMore(r.hasMore);cursor.current.page=next;}}
  catch(e){if(epoch===generation.current)setError(e.message);}finally{if(epoch===generation.current){busy.current=false;setLoading(false);}}
 },[q,hasMore]);
 useEffect(()=>{if(!hasMore||loading||error)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))more();},{rootMargin:'150px'});if(sentinel.current)observer.observe(sentinel.current);return()=>observer.disconnect();},[more,hasMore,loading,error]);
 return <section className="manager" ref={root}><h1>Radios de Paraguay</h1><p>{total} emisoras · Se cargan y verifican mientras navegás.</p><input type="search" aria-label="Buscar radio" placeholder="Buscar radio o ciudad…" value={q} onChange={e=>setQ(e.target.value)}/>{error&&<p role="alert">{error} <button onClick={()=>items.length?more():setRetry(x=>x+1)}>Reintentar</button></p>}<div className="social-radio-grid">{items.map(r=><button key={r.id} data-signal-id={r.id} onClick={()=>onOpen({...r,type:'radio'})}><span className="social-avatar">{r.logo?<img src={r.logo} alt="" loading="lazy"/>:'♫'}</span><strong>{r.name}</strong><small>{r.city}</small><span className={`signal-status ${r.status}`}>● {r.status==='online'?(r.stale?'Online · actualizando':'Online'):r.status==='offline'?'Sin señal':r.status==='error'?'No se pudo verificar':'Verificando'}</span></button>)}</div><div ref={sentinel}>{loading&&<p role="status">Cargando…</p>}{hasMore&&!loading&&<button onClick={more}>Cargar más radios</button>}</div></section>;
}
