import { channelSettings,saveChannelSettings,saveChannelCheck } from './channelState.js';
import { checkStream } from './checker.js';

// Señal encontrada en https://www.c9n.com.py/envivo/ y comprobada hasta
// un segmento de video. Solo se aplica si el administrador no editó sus URLs.
const repairs=[{id:'C9N.py',website:'https://www.c9n.com.py/envivo/',stream:{url:'https://ddycmnicl95kp.cloudfront.net/live/qnxsy62odjyb/master.m3u8',quality:null,userAgent:null,referrer:'https://www.c9n.com.py/'}}];
export async function applyOfficialChannelRepairs() {
 for(const repair of repairs) {
  const existing=channelSettings(repair.id);
  if(existing.streams||existing.blocked||existing.deleted)continue;
  const check=await checkStream(repair.stream);
  if(!check.ok)continue;
  await saveChannelSettings(repair.id,{website:repair.website,streams:[repair.stream]});
  await saveChannelCheck(repair.id,[repair.stream],[{...repair.stream,...check}]);
  console.log('[channels] Señal oficial corregida:',repair.id);
 }
}
