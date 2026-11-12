import React,{useEffect,useState} from 'react';
import {api} from '../api.js';
import {getAppSettings,saveAppSettings} from '../appSettings.js';
import {promptInstall,subscribePwa} from '../pwa.js';
import './account.css';
export default function Settings(){
 const [settings,setSettings]=useState(getAppSettings),[enabled,setEnabled]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[pwa,setPwa]=useState({});
 const [permission,setPermission]=useState(()=>typeof Notification==='undefined'?'unsupported':Notification.permission);
 useEffect(()=>{api.notifications().then(r=>setEnabled(r.enabled)).catch(e=>setError(e.message));return subscribePwa(setPwa);},[]);
 function local(key,value){try{setSettings(saveAppSettings({[key]:value}));}catch{setError('No pudimos guardar esta preferencia en el navegador.');}}
 async function notices(value){setBusy(true);setError('');try{await api.notificationSettings(value);setEnabled(value);}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function allow(){try{const result=await Notification.requestPermission();setPermission(result);if(result==='granted')local('browserAlerts',true);}catch{setError('Abrí los permisos de este sitio para habilitar las notificaciones.');}}
 const toggle=(title,description,value,onChange,disabled=false)=><label className="setting-row"><span><strong>{title}</strong><small>{description}</small></span><input role="switch" type="checkbox" checked={!!value} disabled={disabled} onChange={e=>onChange(e.target.checked)}/></label>;
 return <div className="account-hub"><header className="account-heading"><div><span className="account-eyebrow">A TU MANERA</span><h1>Configuración</h1><p>Elegí cómo querés usar LiveTV en este dispositivo.</p></div></header>{error&&<p className="banner error" role="alert">{error}</p>}
 <section className="profile-card"><h2>Notificaciones</h2>{toggle('Recibir avisos de mi cuenta','Novedades, pagos y movimientos. Esta preferencia se comparte con Android.',enabled,notices,busy||enabled===null)}{permission!=='unsupported'&&<>{toggle('Avisos de este navegador','Mostrar avisos del sistema cuando LiveTV está abierto, incluso en otra pestaña.',settings.browserAlerts,v=>v&&permission!=='granted'?allow():local('browserAlerts',v),enabled===false)}<p className="muted">Permiso del navegador: {permission==='granted'?'permitido':permission==='denied'?'bloqueado; podés cambiarlo en los permisos del sitio':'sin solicitar'}.</p></>}<p className="muted">Para recibir avisos con la app cerrada, usá el APK de Android. El navegador puede suspender las pestañas en segundo plano.</p></section>
 <section className="profile-card"><h2>Reproducción</h2>{toggle('Continuar al minimizar','Mantener el audio al cambiar de pestaña. El navegador y el sistema controlan la reproducción en segundo plano.',settings.background,v=>local('background',v))}{toggle('Mantener la pantalla encendida','Mientras el video está reproduciéndose y esta pestaña está visible, si el navegador lo permite.',settings.keepScreenOn,v=>local('keepScreenOn',v))}</section>
 <section className="profile-card"><h2>Aplicación y batería</h2><p className="muted">En Android, Config permite abrir los permisos de notificaciones y los ajustes de batería del teléfono. En la web estas opciones las administra el navegador.</p>{pwa.canInstall&&!pwa.installed&&<button className="btn-primary" onClick={promptInstall}>Instalar LiveTV</button>}<a className="btn-ghost settings-apk" href="/cinetv.apk?v=36">Descargar APK de Android</a></section></div>;
}
