import React,{useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
import {promptInstall,subscribePwa} from '../pwa.js';
export default function Perfil({user,onLogout,onNavigate}){
 const [passwords,setPasswords]=useState({currentPassword:'',password:''});
 const [form,setForm]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[pwa,setPwa]=useState({});const fileRef=useRef(null);
 useEffect(()=>{api.profile().then(setForm).catch(e=>setMessage(e.message));return subscribePwa(setPwa);},[]);
 async function save(e){e.preventDefault();setBusy(true);try{await api.updateProfile(form);setMessage('Datos guardados');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  function onLogoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256; let { width, height } = img;
        if (width > height && width > max) { height = (height * max) / width; width = max; }
        else if (height > max) { width = (width * max) / height; height = max; }
        const c = document.createElement('canvas'); c.width = width; c.height = height;
        c.getContext('2d').drawImage(img, 0, 0, width, height);
        setForm((f) => ({ ...f, logoUrl: c.toDataURL('image/jpeg', 0.85) }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }


 if(!form)return <div className="view"><p>{message||'Cargando perfil…'}</p></div>;
 return <div className="view perfil"><div className="view-head"><h2>Mi perfil</h2></div><section className="profile-card"><div className="profile-id"><div className="profile-avatar">{form.logoUrl?<img src={form.logoUrl} alt="Mi imagen"/>:user.username.slice(0,1).toUpperCase()}</div><div><h3>{form.displayName||user.username}</h3><p>{user.role==='admin'?'Administrador':'Afiliado'} · @{user.username}</p>{user.expiresAt&&<small>Plan hasta {new Date(user.expiresAt).toLocaleString('es-PY')}</small>}</div></div><button className="btn-primary wide" onClick={()=>onNavigate('panel')}>{user.role==='admin'?'Administración':'Mi enlace, referidos y billetera'}</button></section><form className="profile-card" onSubmit={save}><h3>Mis datos</h3>{[['displayName','Nombre para mostrar'],['firstName','Nombre'],['lastName','Apellido'],['email','Correo'],['phone','Teléfono / WhatsApp'],['address','Dirección']].map(([k,label])=><label className="fld" key={k}>{label}<input value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/></label>)}<div className="fld">Mi imagen<input ref={fileRef} type="file" accept="image/*" onChange={onLogoFile}/>{form.logoUrl&&<button type="button" className="btn-ghost" onClick={()=>setForm(f=>({...f,logoUrl:''}))}>Quitar imagen</button>}</div><h3>Datos bancarios</h3><p className="muted">{user.role==='admin'?'Los usuarios verán estos datos para pagar el plan.':'Se utilizan para recibir los retiros de tus ganancias.'}</p>{[['bankName','Banco'],['bankHolder','Titular'],['bankAccount','Número de cuenta'],['bankAlias','Alias'],['bankDoc','Cédula / RUC']].map(([k,label])=><label className="fld" key={k}>{label}<input value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/></label>)}<button className="btn-primary wide" disabled={busy}>{busy?'Guardando…':'Guardar datos'}</button>{message&&<p role="status">{message}</p>}</form><form className="profile-card" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await api.changePassword(passwords);setPasswords({currentPassword:'',password:''});setMessage('Contraseña actualizada. Se cerraron las otras sesiones.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}}><h3>Cambiar contraseña</h3><label className="fld">Contraseña actual<input required type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={e=>setPasswords({...passwords,currentPassword:e.target.value})}/></label><label className="fld">Nueva contraseña<input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={passwords.password} onChange={e=>setPasswords({...passwords,password:e.target.value})}/></label><button disabled={busy}>Actualizar contraseña</button></form><div className="profile-card actions">{pwa.canInstall&&!pwa.installed&&<button className="btn-ghost wide" onClick={promptInstall}>Instalar app</button>}<button className="btn-danger wide" onClick={onLogout}>Cerrar sesión</button></div></div>;
}
