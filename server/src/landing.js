import express from 'express';
import {many,one} from './pg.js';
import path from 'node:path';
import {assetDirectory} from './youtube-downloader.js';
import {ensureLoaded} from './iptvSource.js';
import {queryPublicChannels} from './channelCatalog.js';
import {loadRadios} from './radio.js';
import {radioStatuses} from './radio-health.js';

const router=express.Router();
let cached, pending;
// Public merchandising only: never expose playback URLs or private account data.
async function buildShowcase(){
 const [channels,movies,radios]=await Promise.all([
  ensureLoaded().then(()=>queryPublicChannels({country:'PY',pageSize:100})),
  many(`SELECT m.id,title,poster,category,year,a.id AS asset_id,a.cover_name FROM movies m LEFT JOIN media_assets a ON a.movie_id=m.id WHERE NOT hidden AND NOT deleted
   AND (stream_url IS NOT NULL OR EXISTS(SELECT 1 FROM media_sources s WHERE s.content_type='movie' AND s.content_id=m.id AND s.enabled))
   ORDER BY m.created_at DESC,m.id DESC LIMIT 12`),
  loadRadios()
 ]);
 const priority=name=>/snt|abc|unicanal|unpi|telefuturo|paraguay tv|c9n|latele/i.test(name)?0:1;
 return {channels:channels.items.filter(c=>c.status!=='offline').sort((a,b)=>priority(a.name)-priority(b.name)).slice(0,16).map(c=>({id:c.id,name:c.name,logo:c.id==='Unicanal.py'?'/brands/unicanal.png':c.logo,status:c.status})),
  movies:movies.map(({asset_id,cover_name,...m})=>({...m,poster:asset_id&&cover_name?`/api/public/movies/${m.id}/cover`:m.poster})),radios:radioStatuses(radios,{verify:false}).filter(r=>r.status!=='offline').sort((a,b)=>Number(Boolean(b.logo))-Number(Boolean(a.logo))||Number(b.status==='online')-Number(a.status==='online')).slice(0,12).map(r=>({id:r.id,name:r.name,logo:r.logo,city:r.city,status:r.status})),updatedAt:new Date().toISOString()};
}
router.get('/public/movies/:id/cover',async(req,res)=>{
 try{
  if(!/^\d{1,16}$/.test(req.params.id))return res.sendStatus(404);
  const row=await one(`SELECT a.id,a.cover_name FROM media_assets a JOIN movies m ON m.id=a.movie_id WHERE m.id=$1 AND NOT m.hidden AND NOT m.deleted LIMIT 1`,[req.params.id]);
  if(!row||!/^cover\.(jpg|jpeg|png|webp)$/.test(row.cover_name||''))return res.sendStatus(404);
  res.set('Cache-Control','public, max-age=300');
  res.sendFile(path.join(assetDirectory(row.id),row.cover_name),{dotfiles:'deny'},e=>{if(e&&!res.headersSent)res.sendStatus(404);});
 }catch{if(!res.headersSent)res.sendStatus(500);}
});
router.get('/public/showcase',async(req,res)=>{
 res.set('Cache-Control','public, max-age=120, stale-while-revalidate=600');
 if(cached&&Date.now()-cached.at<300000)return res.json(cached.value);
 if(!pending)pending=buildShowcase().then(value=>{cached={at:Date.now(),value};return value;}).finally(()=>{pending=null;});
 try{res.json(await pending);}catch(e){console.warn('[landing]',e.message);if(cached)return res.json(cached.value);res.status(503).json({error:'Catálogo temporalmente no disponible'});}
});
export default router;
