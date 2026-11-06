import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './system-dialog.css';
const DialogContext=createContext(null);
export function DialogProvider({children}){
 const queue=useRef([]),dialog=useRef(null),[current,setCurrent]=useState(null);
 const ask=useCallback(options=>new Promise(resolve=>{const entry={...options,resolve};queue.current.push(entry);if(queue.current.length===1)setCurrent(entry);}),[]);
 const finish=useCallback(value=>{const entry=queue.current.shift();entry?.resolve(value);setCurrent(queue.current[0]||null);},[]);
 useEffect(()=>{const el=dialog.current;if(current&&!el.open)el.showModal();else if(!current&&el.open)el.close();},[current]);
 useEffect(()=>()=>{queue.current.splice(0).forEach(entry=>entry.resolve(false));},[]);
 const actions=useMemo(()=>({confirm:options=>ask(typeof options==='string'?{message:options}:options),alert:options=>ask({...typeof options==='string'?{message:options}:options,alert:true})}),[ask]);
 return <DialogContext.Provider value={actions}>{children}{createPortal(<dialog ref={dialog} className="system-dialog" aria-labelledby="system-dialog-title" aria-describedby="system-dialog-message" onCancel={e=>{e.preventDefault();finish(false);}}><div className="system-dialog-body"><div className={'system-dialog-icon '+(current?.danger?'danger':'')} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 8v5m0 3h.01M10.3 3.9 2.7 17.1A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg></div><span className="system-dialog-brand">LIVETV</span><h2 id="system-dialog-title">{current?.title||'Confirmar acción'}</h2><p id="system-dialog-message">{current?.message}</p><div className="system-dialog-actions">{!current?.alert&&<button autoFocus className="system-dialog-cancel" onClick={()=>finish(false)}>{current?.cancelText||'Cancelar'}</button>}<button className={'system-dialog-accept '+(current?.danger?'danger':'')} onClick={()=>finish(true)}>{current?.confirmText||'Aceptar'}</button></div></div></dialog>,document.body)}</DialogContext.Provider>;
}
export function useDialog(){const value=useContext(DialogContext);if(!value)throw Error('DialogProvider is required');return value;}
