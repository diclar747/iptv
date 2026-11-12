import React,{createContext,useContext,useEffect,useState,useRef} from 'react';
import {useAuth} from './auth.jsx';
import {api} from './api.js';
import './channelFavorites.css';
const Context=createContext(null);
export function ChannelFavoritesProvider({children}){
 const {user}=useAuth();
 const [items,setItems]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [pending,setPending]=useState(false);
 const busy=useRef(false),requestVersion=useRef(0),account=useRef(user?.id);account.current=user?.id;
 useEffect(()=>{
  let alive=true;setItems([]);setError('');
  const load=()=>{
   if(!user||document.hidden||busy.current)return;
   const version=++requestVersion.current;setLoading(true);
   api.channelFavorites().then(r=>{if(alive&&version===requestVersion.current)setItems(r);}).catch(e=>{if(alive&&version===requestVersion.current)setError(e.message);}).finally(()=>{if(alive&&version===requestVersion.current)setLoading(false);});
  };
  load();window.addEventListener('focus',load);document.addEventListener('visibilitychange',load);const timer=setInterval(load,30000);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',load);};
 },[user?.id]);
 async function toggle(c){
  if(busy.current||loading)return;
  const owner=user?.id;busy.current=true;setPending(true);setError('');
  try{if(items.some(x=>x.id===c.id)){await api.removeChannelFavorite(c.id);if(account.current===owner)setItems(old=>old.filter(x=>x.id!==c.id));}else{await api.addChannelFavorite(c.id);if(account.current===owner)setItems(old=>[...old,{...c,type:'channel'}]);}}
  catch(e){if(account.current===owner)setError(e.message);}finally{busy.current=false;setPending(false);}
 }
 return <Context.Provider value={{items,loading,error,pending,toggle}}>{children}{error&&<div className="favorites-error" role="alert">{error}<button onClick={()=>setError('')} aria-label="Cerrar aviso de favoritos">×</button></div>}</Context.Provider>;
}
export const useChannelFavorites=()=>useContext(Context);
export function FavoriteButton({channel}){
 const {items,toggle,pending,loading}=useChannelFavorites();const saved=items.some(x=>x.id===channel.id);
 return <button className={'channel-favorite'+(saved?' saved':'')} aria-label={(saved?'Quitar de favoritos: ':'Agregar a favoritos: ')+(channel.name||channel.title)} title={saved?'Quitar de favoritos':'Agregar a favoritos'} aria-pressed={saved} disabled={pending||loading} onClick={()=>toggle(channel)}><span aria-hidden="true">{saved?'★':'☆'}</span></button>;
}
