import {useEffect,useRef,useState} from 'react';
// Observe cards rather than downloading/checking the complete catalogue on a timer.
export function useVisibleSignals(items,load,apply){
 const root=useRef(null),latest=useRef({load,apply});latest.current={load,apply};
 const [ids,setIds]=useState('');const key=items.map(x=>x.id).join(',');
 useEffect(()=>{
  const visible=new Set();
  const observer=new IntersectionObserver(entries=>{entries.forEach(e=>{const id=e.target.dataset.signalId;if(e.isIntersecting)visible.add(id);else visible.delete(id);});setIds([...visible].sort().slice(0,20).join(','));},{threshold:.1});
  root.current?.querySelectorAll('[data-signal-id]').forEach(el=>observer.observe(el));
  return()=>observer.disconnect();
 },[key]);
 useEffect(()=>{if(!ids)return;let alive=true,running=false;
  const poll=async()=>{if(running||document.hidden)return;running=true;try{const result=await latest.current.load(ids);if(alive)latest.current.apply(result);}catch{}finally{running=false;}};
  poll();const timer=setInterval(poll,8000);return()=>{alive=false;clearInterval(timer);};
 },[ids]);
 return root;
}
