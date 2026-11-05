import express from 'express';import path from 'node:path';import {stat} from 'node:fs/promises';
import {one} from './pg.js';import {requireActiveViewer} from './auth.js';import {assetDirectory,PUBLIC_BASE} from './youtube-downloader.js';
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function libraryReference(value){try{const u=new URL(value);if(u.origin!==new URL(PUBLIC_BASE).origin)return null;const m=u.pathname.match(/^\/api\/library\/([^/]+)\/(video\.mp4|cover\.(?:jpg|jpeg|png|webp))$/);return m&&ID.test(m[1])?{id:m[1],file:m[2]}:null;}catch{return null;}}
async function asset(id,includeHidden=false){return one(`SELECT a.*,m.hidden,m.deleted FROM media_assets a JOIN movies m ON m.id=a.movie_id WHERE a.id=$1 ${includeHidden?'':'AND NOT m.hidden AND NOT m.deleted'}`,[id]);}
async function sendAsset(id,file,req,res){
 const row=await asset(id);if(!row||![row.video_name,row.cover_name].includes(file)){res.status(404).json({error:'Archivo no disponible'});return;}
 const full=path.join(assetDirectory(id),file);res.set('Cache-Control',file==='video.mp4'?'private, no-store':'private, max-age=86400');
 await new Promise(resolve=>res.sendFile(full,{dotfiles:'deny',acceptRanges:true},error=>{if(error&&!res.headersSent&&!res.destroyed)res.status(error.status===416?416:404).json({error:error.status===416?'Rango de video no válido':'Archivo no encontrado en el servidor'});resolve();}));
}
export async function tryLibraryProxy(url,req,res){const ref=libraryReference(url);if(!ref)return false;await sendAsset(ref.id,ref.file,req,res);return true;}
export async function checkLibraryFile(url){const ref=libraryReference(url);if(!ref)return null;const row=await asset(ref.id,true);if(!row||ref.file!==row.video_name)return {ok:false,error:'Archivo no encontrado'};try{const file=await stat(path.join(assetDirectory(ref.id),ref.file));return {ok:file.size>24,status:200,contentType:'video/mp4',bytes:file.size};}catch{return {ok:false,error:'El archivo no existe en el almacenamiento'};}}
const router=express.Router();router.get('/library/:id/:file',requireActiveViewer,async(req,res)=>{try{if(!ID.test(req.params.id))return res.status(404).json({error:'Archivo no encontrado'});await sendAsset(req.params.id,req.params.file,req,res);}catch{if(!res.headersSent)res.status(500).json({error:'No se pudo abrir el archivo'});}});
export default router;
