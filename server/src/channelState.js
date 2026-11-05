import { createHash } from 'node:crypto';
import { many, query } from './pg.js';
const overrides = new Map(), health = new Map();
export async function initChannelState() {
  const [settings, checks] = await Promise.all([many('SELECT * FROM channel_overrides'),many('SELECT * FROM channel_health')]);
  overrides.clear(); health.clear();
  settings.forEach(r=>overrides.set(r.channel_id,r.settings)); checks.forEach(r=>health.set(r.channel_id,r));
}
export const channelSettings = id => overrides.get(id) || {};
export const channelVisible = id => { const s=channelSettings(id); return !s.blocked && !s.deleted; };
export function managedStreams(id,streams) {
  const s=channelSettings(id);
  const effective=s.streams||streams, result=health.get(id);
  if(!result||Date.now()-new Date(result.checked_at).getTime()>15*60*1000)return effective;
  const active=new Set(result.details.filter(r=>r.ok).map(r=>r.url));
  return effective.slice().sort((a,b)=>Number(active.has(b.url))-Number(active.has(a.url)));
}
export function streamFingerprint(streams) { return createHash('sha256').update(JSON.stringify(streams.map(s=>({url:s.url,userAgent:s.userAgent||null,referrer:s.referrer||null})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))).digest('hex'); }
export const channelCheckDetails = id => health.get(id)?.details || [];
export function channelStatus(id,streams) {
  const settings=channelSettings(id), result=health.get(id);
  if(settings.deleted) return {status:'deleted',checkedAt:result?.checked_at || null};
  if(settings.blocked) return {status:'blocked',checkedAt:result?.checked_at || null};
  const fresh=result && Date.now()-new Date(result.checked_at).getTime()<15*60*1000 && (!streams || result.fingerprint===streamFingerprint(streams));
  return {status:fresh?result.status:'unchecked',checkedAt:result?.checked_at || null};
}
export function managedCard(card,streams) {
  const s=channelSettings(card.id);
  const effective=streams?managedStreams(card.id,streams):undefined;
  return {...card,category:card.category||card.categories?.[0]||'general',...(s.name?{name:s.name}:{}),...(s.country?{country:s.country}:{}),...(s.category?{categories:[s.category],category:s.category}:{}),
    ...(s.logoUrl!==undefined?{logo:s.logoUrl}:{}),...(s.website!==undefined?{website:s.website}:{}),
    ...(effective?{streamCount:effective.length}:{}),...channelStatus(card.id,effective)};
}
export async function saveChannelSettings(id,patch) {
  const settings={...channelSettings(id),...patch};
  await query(`INSERT INTO channel_overrides (channel_id,settings) VALUES ($1,$2) ON CONFLICT(channel_id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=now()`,[id,settings]);
  overrides.set(id,settings);
  if(patch.streams) {health.delete(id);await query('DELETE FROM channel_health WHERE channel_id=$1',[id]);}
  return settings;
}
export async function resetChannelSettings(id) {
  await query('DELETE FROM channel_overrides WHERE channel_id=$1',[id]); overrides.delete(id);health.delete(id);
  await query('DELETE FROM channel_health WHERE channel_id=$1',[id]);
}
export async function saveChannelCheck(id,streams,results) {
  const status=results.some(r=>r.ok)?'online':'offline', fingerprint=streamFingerprint(streams);
  const row={channel_id:id,fingerprint,status,checked_at:new Date().toISOString(),details:results};
  await query(`INSERT INTO channel_health(channel_id,fingerprint,status,details) VALUES($1,$2,$3,$4) ON CONFLICT(channel_id) DO UPDATE SET fingerprint=EXCLUDED.fingerprint,status=EXCLUDED.status,details=EXCLUDED.details,checked_at=now()`,[id,fingerprint,status,JSON.stringify(results)]);
  health.set(id,row);return {...channelStatus(id,streams),results};
}
