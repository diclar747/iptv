import {Router} from 'express';
import {many,query} from './pg.js';
import {ensureLoaded,getChannelStreams} from './iptvSource.js';
import {isManualId,manualStreams} from './manualChannels.js';
import {requireActiveViewer} from './auth.js';

const router=Router();
router.use(requireActiveViewer);
const channel=async id=>(isManualId(id)?await manualStreams(id):getChannelStreams(id))?.channel;
const handle=fn=>async(req,res,next)=>{try{await ensureLoaded();await fn(req,res);}catch(e){next(e);}};
router.get('/',handle(async(req,res)=>{
 const rows=await many('SELECT channel_id FROM user_channel_favorites WHERE user_id=$1 ORDER BY created_at,channel_id',[req.user.id]);
 const items=await Promise.all(rows.map(r=>channel(r.channel_id)));
 res.set('Cache-Control','private, no-store').json(items.filter(Boolean));
}));
router.put('/:id',handle(async(req,res)=>{
 if(!await channel(req.params.id))return res.status(404).json({error:'Canal no disponible'});
 await query('INSERT INTO user_channel_favorites(user_id,channel_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,req.params.id]);
 res.json({ok:true});
}));
router.delete('/:id',handle(async(req,res)=>{
 await query('DELETE FROM user_channel_favorites WHERE user_id=$1 AND channel_id=$2',[req.user.id,req.params.id]);
 res.json({ok:true});
}));
export default router;
