import React,{useState} from 'react';
import ChannelManager from './ChannelManager.jsx';
import CatalogAdmin from './CatalogAdmin.jsx';
import AffiliateAdmin from './AffiliateAdmin.jsx';
export default function AdminPanel(){
 const [tab,setTab]=useState('resumen');
 return <div className="panel"><nav className="panel-tabs" aria-label="Administración">{[['resumen','Resumen'],['afiliados','Afiliados'],['solicitudes','Solicitudes'],['canales','Canales'],['catalogo','Películas']].map(([k,label])=><button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{label}</button>)}</nav>{tab==='canales'?<ChannelManager/>:tab==='catalogo'?<CatalogAdmin/>:<AffiliateAdmin mode={tab}/>}</div>;
}
