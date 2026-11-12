import express from 'express';import {many} from './pg.js';import {requireRole} from './auth.js';
import mediaCategories from './media-categories.js';
import {previewYoutube,importerCapabilities} from './youtube-downloader.js';import {createYoutubeJob,cancelYoutubeJob} from './youtube-import.js';
const router=express.Router(),h=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(e=>res.status(e.status||500).json({error:e.message||'No se pudo completar la operación'}));
router.use('/admin/youtube',requireRole('admin'));
router.use(mediaCategories);
router.get('/admin/youtube',h(async(req,res)=>{
 const [capabilities,jobs,published]=await Promise.all([
  importerCapabilities(),
  many(`SELECT id,source_url,state,execution,device_id,upload_size,upload_bytes,processing,progress,error,retry_after,
    movie_id,created_at,COALESCE(NULLIF(options->>'title',''),metadata->>'title',source_url) AS title
    FROM media_import_jobs WHERE state NOT IN ('done','cancelled')
    ORDER BY (state='error'),created_at,id LIMIT 100`),
  many(`SELECT DISTINCT ON (execution) execution,id FROM media_import_jobs WHERE state='done'
    ORDER BY execution,updated_at DESC,id DESC`),
 ]);
 res.json({capabilities,jobs,published:Object.fromEntries(published.map(job=>[job.execution,job.id]))});
}));
router.post('/admin/youtube/preview',h(async(req,res)=>res.json(await previewYoutube(req.body?.url))));
router.post('/admin/youtube',h(async(req,res)=>{if(!(await importerCapabilities()).ready)return res.status(503).json({error:'El servidor necesita el descargador y una carpeta persistente para guardar videos. Revisá DEPLOY.md.'});const job=await createYoutubeJob(req.body||{},req.user.id);res.status(202).json({id:job.id,state:job.state});}));
router.post('/admin/youtube/:id/cancel',h(async(req,res)=>{if(!/^[a-f0-9-]{36}$/i.test(req.params.id))return res.status(400).json({error:'Importación inválida'});res.json(await cancelYoutubeJob(req.params.id));}));
export default router;
