import express from 'express';
import { ensureLoaded, getState, getChannelStreams, queryChannels } from './iptvSource.js';
import { many, one, query } from './pg.js';
import { requireRole, requireActiveViewer } from './auth.js';
import { managedCard, managedStreams, channelSettings, saveChannelSettings, resetChannelSettings, saveChannelCheck, channelCheckDetails,channelStatus } from './channelState.js';
import { checkMany } from './checker.js';

const router=express.Router();
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(e=>res.status(e.status||500).json({error:e.message}));
router.use('/admin/channels',requireRole('admin'));
router.get('/channels/status',requireActiveViewer,h(async(req,res)=>{
 const ids=[...new Set(String(req.query.ids||'').split(',').filter(Boolean))].slice(0,100);
 res.set('Cache-Control','private, no-store');
 res.json(await Promise.all(ids.map(async id=>{const record=await channelRecord(id);return {id,...channelStatus(id,record?.streams||[])};})));
}));
export async function allManagedChannels() {
 await ensureLoaded();
 const provider=queryChannels({onlyWithStreams:false,includeHidden:true,pageSize:100000}).items;
 const manual=(await many('SELECT * FROM manual_channels')).map(r=>managedCard({id:'man:'+r.id,name:r.name,country:r.country,categories:[r.category],logo:r.logo_url,website:null,manual:true,enabled:r.enabled},[{url:r.stream_url,quality:null,userAgent:r.user_agent||null,referrer:r.referrer||null}]));
 return [...manual,...provider].map(c=>({...c,source:c.manual?'manual':'iptv-org',...channelSettings(c.id),blocked:channelSettings(c.id).blocked||c.enabled===false,status:channelSettings(c.id).deleted?'deleted':c.enabled===false?'blocked':c.status,category:channelSettings(c.id).category||c.categories?.[0]||'general'}));
}
export async function channelRecord(id) {
 await ensureLoaded();
 if(id.startsWith('man:')) {
  const r=await one('SELECT * FROM manual_channels WHERE id=$1',[id.slice(4)]);if(!r)return null;
  const streams=managedStreams(id,[{url:r.stream_url,quality:null,userAgent:r.user_agent||null,referrer:r.referrer||null}]);
  return {channel:managedCard({id,name:r.name,country:r.country,categories:[r.category],logo:r.logo_url,manual:true,enabled:r.enabled},streams),streams};
 }
 return getChannelStreams(id,{includeHidden:true});
}
export async function verifyChannel(id) {
 const record=await channelRecord(id);if(!record)throw Object.assign(Error('Canal no encontrado'),{status:404});
 const results=await checkMany(record.streams,{concurrency:3});
 return saveChannelCheck(id,record.streams,results);
}
const job={running:false,stop:false,total:0,done:0,online:0,offline:0,errors:0,current:null,startedAt:null};
export const channelJob=()=>({...job});
export async function startChannelChecks(filters={}) {
 if(job.running)return {ok:false,error:'Ya hay una verificación en curso'};
 Object.assign(job,{running:true,stop:false,total:0,done:0,online:0,offline:0,errors:0,startedAt:new Date().toISOString()});
 void (async()=>{
  const rows=(await allManagedChannels()).filter(c=>!c.deleted&&!c.blocked&&c.enabled!==false&&c.streamCount>0&&(!filters.country||c.country===filters.country)&&(!filters.category||c.categories?.includes(filters.category)));
  rows.sort((a,b)=>Number(b.country==='PY')-Number(a.country==='PY'));
  job.total=rows.length;let index=0;
  await Promise.all(Array.from({length:3},async()=>{while(index<rows.length&&!job.stop){const channel=rows[index++];job.current=channel.name;try{const r=await verifyChannel(channel.id);job[r.status==='online'?'online':'offline']++;}catch{job.errors++;}job.done++;}}));
 })().catch(e=>{job.errors++;job.current=e.message;}).finally(()=>{job.running=false;});
 return {ok:true};
}
router.get('/admin/channels',h(async(req,res)=>{
 const q=String(req.query.search||'').toLowerCase(),page=Math.max(1,parseInt(req.query.page)||1),size=40;
 let rows=await allManagedChannels();
 const totals={total:rows.length,online:rows.filter(c=>c.status==='online').length,offline:rows.filter(c=>c.status==='offline').length,blocked:rows.filter(c=>c.blocked).length};
 rows=rows.filter(c=>(!q||`${c.name} ${c.id}`.toLowerCase().includes(q))&&(!req.query.country||c.country===req.query.country)&&(!req.query.category||c.categories?.includes(req.query.category))&&(!req.query.status||c.status===req.query.status)&&(!req.query.source||c.source===req.query.source));
 if(req.query.status!=='deleted')rows=rows.filter(c=>!c.deleted);
 const total=rows.length;res.json({items:rows.slice((page-1)*size,page*size),total,page,pages:Math.ceil(total/size),totals,job:channelJob()});
}));
router.get('/admin/channels/job',h(async(req,res)=>res.json(channelJob())));
router.post('/admin/channels/verify',h(async(req,res)=>res.json(await startChannelChecks(req.body||{}))));
router.post('/admin/channels/stop',h(async(req,res)=>{job.stop=true;res.json({ok:true});}));
router.get('/admin/channels/:id',h(async(req,res)=>{const r=await channelRecord(req.params.id);if(!r)return res.status(404).json({error:'No encontrado'});res.json({...r,settings:channelSettings(req.params.id),checks:channelCheckDetails(req.params.id)});}));
router.post('/admin/channels/:id/verify',h(async(req,res)=>res.json(await verifyChannel(req.params.id))));
router.patch('/admin/channels/:id',h(async(req,res)=>{
 if(!await channelRecord(req.params.id))return res.status(404).json({error:'No encontrado'});
 const input=req.body||{},patch={};
 for(const field of ['name','country','category','logoUrl','website'])if(input[field]!==undefined)patch[field]=String(input[field]).trim().slice(0,2000);
 if(patch.country)patch.country=patch.country.toUpperCase();if(patch.category)patch.category=patch.category.toLowerCase();
 if(patch.name==='')return res.status(400).json({error:'El nombre es obligatorio'});
 for(const field of ['blocked','deleted'])if(input[field]!==undefined){if(typeof input[field]!=='boolean')return res.status(400).json({error:'Estado inválido'});patch[field]=input[field];}
 if(input.streams!==undefined){
  if(!Array.isArray(input.streams)||input.streams.length>20)return res.status(400).json({error:'Máximo 20 URLs por canal'});
  patch.streams=input.streams.map(s=>({url:String(s.url||'').trim(),quality:s.quality||null,userAgent:s.userAgent||null,referrer:s.referrer||null}));
  if(patch.streams.some(s=>!/^https?:\/\//i.test(s.url)))return res.status(400).json({error:'Las URLs deben comenzar con http(s)://'});
 }
 if(req.params.id.startsWith('man:')&&patch.blocked!==undefined)await query('UPDATE manual_channels SET enabled=$1 WHERE id=$2',[!patch.blocked,req.params.id.slice(4)]);
 res.json({ok:true,settings:await saveChannelSettings(req.params.id,patch)});
}));
router.delete('/admin/channels/:id',h(async(req,res)=>res.json({ok:true,settings:await saveChannelSettings(req.params.id,{deleted:true})})));
router.post('/admin/channels/:id/restore',h(async(req,res)=>{if(req.params.id.startsWith('man:'))await query('UPDATE manual_channels SET enabled=true WHERE id=$1',[req.params.id.slice(4)]);await saveChannelSettings(req.params.id,{deleted:false,blocked:false});res.json({ok:true});}));
router.post('/admin/channels/:id/reset',h(async(req,res)=>{await resetChannelSettings(req.params.id);res.json({ok:true});}));
export default router;
