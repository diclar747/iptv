import React,{useState} from 'react';
import {useAuth} from '../auth.jsx';
import Perfil from './Perfil.jsx';
import AffiliatePanel from '../panel/AffiliatePanel.jsx';
import BankAccounts from '../panel/BankAccounts.jsx';
import Panel from '../panel/Panel.jsx';
import AccountAvatar, { accountName } from '../ui/AccountIdentity.jsx';
import './account.css';

export default function AccountHub({user,onLogout,initialSection='datos',standalone=false,embedded=false}){
 const {refresh}=useAuth();
 const admin=user.role==='admin';
 const sections=[['datos','Datos personales'],...(!admin?[['billetera','Referidos y billetera']]:[]),['bancos',admin?'Cuentas de cobro':'Cuentas bancarias'],['seguridad','Seguridad'],...(admin?[['administracion','Administración']]:[])];
 const normalize=s=>s==='billetera'&&admin?'administracion':sections.some(([id])=>id===s)?s:'datos';
 const [section,setSection]=useState(()=>normalize(initialSection));
 const [bank,setBank]=useState('');
 function navigate(id){setSection(normalize(id));if(standalone){const url=new URL(location.href);url.pathname='/cuenta';url.searchParams.set('section',id);if(embedded)url.searchParams.set('embedded','android');history.replaceState(null,'',url);}window.scrollTo({top:0,behavior:'smooth'});}
 async function logout(){await onLogout();if(embedded)location.assign('/cuenta?embedded=android&signedOut=1');}
 return <div className={'account-hub'+(embedded?' embedded':'')}>
  {standalone&&!embedded&&<a className="account-back" href="/">← Volver a LiveTV</a>}
  <header className="account-heading">
   <div className="account-identity">
    <AccountAvatar className="account-avatar" user={user}/>
    <div>
     <span className="account-eyebrow">MI CUENTA</span>
     <h1>{accountName(user)}</h1>
     <p>{user.googleAccount
       ? user.email && user.email !== accountName(user) && <>{user.email} · </>
       : <>@{user.username} · </>}
      {admin?'Administrador':'Afiliado'}</p>
    </div>
   </div>
   <button className="btn-ghost" onClick={logout}>Cerrar sesión</button>
  </header>
  {!admin&&<div className={'account-plan '+(user.subscription?.active===false?'inactive':'')}><span>{user.subscription?.active===false?'Plan inactivo':'Tu plan'}</span><strong>{user.packageName||'LiveTV'}</strong>{user.expiresAt&&<small>Vence el {new Date(user.expiresAt).toLocaleDateString('es-PY')}</small>}<button onClick={()=>navigate('billetera')}>Ver pagos y renovar →</button></div>}
  <nav className="account-tabs" aria-label="Secciones de mi cuenta">{sections.map(([id,label])=><button key={id} aria-current={section===id?'page':undefined} onClick={()=>navigate(id)}>{label}</button>)}</nav>
  {section==='datos'&&<Perfil key="datos" section="datos" user={user} onSaved={refresh}/>}
  {section==='seguridad'&&<><Perfil key="seguridad" section="seguridad" user={user}/>{new URLSearchParams(location.search).has('updated')&&<p role="status">Contraseña actualizada. Las otras sesiones se cerraron.</p>}</>}
  {section==='billetera'&&!admin&&<AffiliatePanel onManageBanks={()=>navigate('bancos')}/>}
  {section==='bancos'&&<><Perfil key="bancos" section="bancos" user={user} onSaved={refresh}/><section className="profile-card aff-panel"><h2>Otras cuentas para retiros</h2><p>Administrá aquí las cuentas adicionales que podés elegir al solicitar un retiro.</p><BankAccounts key={user.bankAccount||'banks'} value={bank} onChange={setBank} manageOnly/></section></>}
  {section==='administracion'&&admin&&<Panel user={user}/>}
 </div>;
}
