import React,{useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
export default function PaymentForm({provider,plan,pending,onComplete,topup=false}){
 const [amount,setAmount]=useState('');
 const [file,setFile]=useState(null),[reference,setReference]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState('');const key=useRef(crypto.randomUUID()),uploaded=useRef(null);
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 async function send(e){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   if(!file)throw Error('Adjuntá la imagen del comprobante');
   if(!uploaded.current)uploaded.current=await api.uploadPaymentReceipt(file);
   const details={reference,receiptId:uploaded.current.id,requestKey:key.current};
   if(topup)await api.walletTopup({...details,amount});else await api.affiliatePayment(details);
   key.current=crypto.randomUUID();uploaded.current=null;setFile(null);setReference('');setAmount('');e.target.reset();await onComplete();
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 const bankReady=Boolean(provider?.bankName&&provider.bankHolder&&(provider.bankAccount||provider.bankAlias));
 const disabled=busy||pending||(topup&&!bankReady);
 function selectReceipt(e){setFile(e.target.files?.[0]||null);uploaded.current=null;}
 return <section className="aff-card">
  <h3>{topup?'Cargar dinero':'Pagar por transferencia'}</h3>
  <p>{topup?'Depositá a la cuenta indicada y adjuntá el comprobante. El saldo se acredita cuando el administrador verifica la transferencia.':`${plan.name} · Gs. ${Number(plan.amount).toLocaleString('es-PY')} · ${plan.durationDays} días.`}</p>
  {provider?.bankName?<div className="aff-bank">
   <b>{provider.bankName}</b><span>Titular: {provider.bankHolder}</span><span>Cuenta: <strong>{provider.bankAccount||'—'}</strong></span>
   {provider.bankAlias&&<span>Alias: {provider.bankAlias}</span>}<span>CI/RUC: {provider.bankDoc||'—'}</span>
   {provider.qrAvailable&&<img className="aff-payment-qr" src="/api/billing/provider/qr" alt="Código QR para la transferencia"/>}
  </div>:<p>Consultá al administrador los datos de cobro.</p>}
  {!topup&&<p>Adjuntá el comprobante. El administrador activa o extiende el plan cuando confirma el pago.</p>}
  <form onSubmit={send}>
   {topup&&<label>Monto transferido en guaraníes<input required type="number" min="1" max="1000000000" step="1" value={amount} onChange={e=>setAmount(e.target.value)} disabled={disabled}/></label>}
   <label>Referencia de la transferencia<input required maxLength={120} value={reference} onChange={e=>setReference(e.target.value)} disabled={disabled}/></label>
   <label>Examinar comprobante<input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={selectReceipt}/></label>
   <label>O sacar una foto<input type="file" capture="environment" accept="image/*" disabled={disabled} onChange={selectReceipt}/></label>
   {preview&&<img className="aff-receipt-preview" src={preview} alt="Comprobante seleccionado"/>}
   <button disabled={disabled||!file}>{busy?'Enviando comprobante…':topup?'Enviar recarga para revisión':'Enviar pago para revisión'}</button>
   {pending&&<small>Tu pago está pendiente de verificación.</small>}
   {error&&<p className="aff-warning" role="alert">{error}</p>}
  </form>
 </section>;
}
