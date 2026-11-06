import {notify} from './notifications.js';
import express from 'express';
import {checkLibraryFile} from './media-library.js';
import { many,one,query,tx } from './pg.js';
import { requireRole } from './auth.js';
import { checkMany } from './checker.js';
import { saveChannelCheck,channelStatus } from './channelState.js';
const router=express.Router();const h=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(e=>res.status(e.status||500).json({error:e.message}));
router.use('/admin/movies',requireRole('admin'));
async function details(id){
 const movie=await one('SELECT * FROM movies WHERE id=$1',[id]);if(!movie)return null;
 const sources=await many("SELECT url,kind,quality,user_agent AS \"userAgent\",referrer FROM media_sources WHERE content_type='movie' AND content_id=$1 ORDER BY id",[id]);
 if(movie.stream_url)sources.unshift({url:movie.stream_url,kind:/\.m3u8/i.test(movie.stream_url)?'hls':'mp4'});
 return {...movie,streams:sources,...channelStatus('movie:'+id,sources)};
}
router.get('/admin/movies',h(async(req,res)=>{
 const params=[],where=[];if(req.query.search){params.push('%'+req.query.search+'%');where.push(`title ILIKE $${params.length}`);}
 if(req.query.state==='deleted')where.push('deleted');else{where.push('NOT deleted');if(req.query.state==='hidden')where.push('hidden');else if(req.query.state!=='all')where.push('NOT hidden');}
 const condition=where.join(' AND ')||'true';const count=await one(`SELECT count(*)::int n FROM movies WHERE ${condition}`,params);
 const page=Math.max(1,parseInt(req.query.page)||1);params.push(30,(page-1)*30);
 const rows=await many(`SELECT m.*, (CASE WHEN stream_url IS NOT NULL THEN 1 ELSE 0 END + (SELECT count(*) FROM media_sources ms WHERE ms.content_type='movie' AND ms.content_id=m.id AND ms.enabled))::int AS source_count FROM movies m WHERE ${condition} ORDER BY created_at DESC,id DESC LIMIT $${params.length-1} OFFSET $${params.length}`,params);
 res.json({items:rows,total:count.n,page,pages:Math.ceil(count.n/30)});
}));
router.get('/admin/movies/:id',h(async(req,res)=>{const d=await details(req.params.id);if(!d)return res.status(404).json({error:'Película no encontrada'});res.json(d);}));
async function save(input,id){
 const title=String(input.title||'').trim(),sources=input.streams||[];
 if(!title||!Array.isArray(sources)||sources.length>20||sources.some(s=>!/^https?:\/\//i.test(s.url||'')))throw Object.assign(Error('Título y URLs válidas son obligatorios (máximo 20 fuentes)'),{status:400});
 if(!id&&!sources.length)throw Object.assign(Error('Agregá al menos una URL de video'),{status:400});
 return tx(async client=>{
  const kind=['movie','music','documentary','video'].includes(input.content_kind)?input.content_kind:'movie';
  const fields=[title,Number(input.year)||null,input.category||null,input.poster||null,input.description||null,kind];
  let row;if(id)row=(await client.query('UPDATE movies SET title=$1,year=$2,category=$3,poster=$4,description=$5,overview_es=$5,content_kind=$6,stream_url=NULL,updated_at=now() WHERE id=$7 RETURNING id',[...fields,id])).rows[0];
  else row=(await client.query("INSERT INTO movies(title,year,category,poster,description,overview_es,content_kind,provider) VALUES($1,$2,$3,$4,$5,$5,$6,'manual') RETURNING id",fields)).rows[0];
  if(!row)throw Object.assign(Error('Película no encontrada'),{status:404});
  await client.query("DELETE FROM media_sources WHERE content_type='movie' AND content_id=$1",[row.id]);
  for(const s of sources)await client.query("INSERT INTO media_sources(content_type,content_id,url,kind,quality,user_agent,referrer) VALUES('movie',$1,$2,$3,$4,$5,$6)",[row.id,s.url,s.kind||(/\.m3u8/i.test(s.url)?'hls':'mp4'),s.quality||null,s.userAgent||null,s.referrer||null]);
  if(!id)await notify(client,null,'content','Nuevo contenido en LiveTV',title,'movie:'+row.id);
  return row;
 });
}
router.post('/admin/movies',h(async(req,res)=>res.status(201).json(await save(req.body))));
router.put('/admin/movies/:id',h(async(req,res)=>res.json(await save(req.body,req.params.id))));
router.patch('/admin/movies/:id/state',h(async(req,res)=>{
 const {hidden=false,deleted=false}=req.body||{};if(typeof hidden!=='boolean'||typeof deleted!=='boolean')return res.status(400).json({error:'Estado inválido'});
 const row=await one('UPDATE movies SET hidden=$1,deleted=$2 WHERE id=$3 RETURNING id',[hidden||deleted,deleted,req.params.id]);if(!row)return res.status(404).json({error:'No encontrada'});res.json({ok:true});
}));
router.post('/admin/movies/:id/verify',h(async(req,res)=>{const m=await details(req.params.id);if(!m)return res.status(404).json({error:'No encontrada'});res.json(await saveChannelCheck('movie:'+m.id,m.streams,await Promise.all(m.streams.map(async s=>({...s,...(await checkLibraryFile(s.url)|| (await checkMany([s]))[0])})))));}));
export default router;
