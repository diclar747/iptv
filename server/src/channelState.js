import { createHash } from 'node:crypto';
import { many, query } from './pg.js';
import {channelArtwork} from './channel-art.js';
const overrides = new Map(), health = new Map();
const minute = 60 * 1000;
let revision=0;
export const channelSettingsVersion=()=>revision;
export async function initChannelState() {
  const [settings, checks] = await Promise.all([many('SELECT * FROM channel_overrides'),many('SELECT * FROM channel_health')]);
  overrides.clear(); health.clear();revision++;
  settings.forEach(r=>overrides.set(r.channel_id,r.settings)); checks.forEach(r=>health.set(r.channel_id,r));
}
export const channelSettings = id => overrides.get(id) || {};
export const channelVisible = id => { const s=channelSettings(id); return !s.blocked && !s.deleted; };
export function managedStreams(id,streams) {
  const s=channelSettings(id);
  const effective=s.streams||streams, result=health.get(id);
  if (!result || Date.now() - new Date(result.checked_at).getTime() > 15 * 60 * 1000 ||
      result.fingerprint !== streamFingerprint(effective)) return effective;
  const active = new Map(result.details.filter(r => r.ok).map(r => [r.url, r.format]));
  const annotated = effective.map(stream => active.get(stream.url) ? { ...stream, format: active.get(stream.url) } : stream);
  return annotated.sort((a,b)=>Number(active.has(b.url))-Number(active.has(a.url)));
}
export function streamFingerprint(streams) { return createHash('sha256').update(JSON.stringify(streams.map(s=>({url:s.url,userAgent:s.userAgent||null,referrer:s.referrer||null})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))).digest('hex'); }
export const channelCheckDetails = id => health.get(id)?.details || [];
function matchingCheck(id, streams) {
  const result = health.get(id);
  return result && (!streams || result.fingerprint === streamFingerprint(streams)) ? result : null;
}
export function needsChannelCheck(id, streams, { opening = false } = {}) {
  if (!channelVisible(id) || !streams.length) return false;
  const result = matchingCheck(id, streams);
  const age = result?.status === 'offline' ? (opening ? 30 * 1000 : 2 * minute) : 15 * minute;
  return !result || Date.now() - Date.parse(result.checked_at) >= age;
}
export function channelStatus(id,streams) {
  const settings=channelSettings(id), result=health.get(id);
  if(settings.deleted) return {status:'deleted',checkedAt:result?.checked_at || null};
  if(settings.blocked) return {status:'blocked',checkedAt:result?.checked_at || null};
  const matching=matchingCheck(id,streams);
  const recent=matching && Date.now()-Date.parse(matching.checked_at)<60*minute;
  return {status:recent?matching.status:'unchecked',checkedAt:matching?.checked_at || null};
}
export function managedCard(card,streams) {
  const s=channelSettings(card.id);
  const effective=streams?managedStreams(card.id,streams):undefined;
  return {...card,category:card.category||card.categories?.[0]||'general',...(s.name?{name:s.name}:{}),...(s.country?{country:s.country}:{}),...(s.category?{categories:[s.category],category:s.category}:{}),
    logo:channelArtwork(card.id,s.logoUrl!==undefined?s.logoUrl:card.logo),...(s.website!==undefined?{website:s.website}:{}),
    ...(effective?{streamCount:effective.length}:{}),...channelStatus(card.id,effective)};
}
export async function saveChannelSettings(id,patch) {
  const settings={...channelSettings(id),...patch};
  await query(`INSERT INTO channel_overrides (channel_id,settings) VALUES ($1,$2) ON CONFLICT(channel_id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=now()`,[id,settings]);
  overrides.set(id,settings);revision++;
  if(patch.streams) {health.delete(id);await query('DELETE FROM channel_health WHERE channel_id=$1',[id]);}
  return settings;
}
export async function resetChannelSettings(id) {
  await query('DELETE FROM channel_overrides WHERE channel_id=$1',[id]); overrides.delete(id);health.delete(id);revision++;
  await query('DELETE FROM channel_health WHERE channel_id=$1',[id]);
}
export async function saveChannelCheck(id,streams,results) {
  const status=results.some(r=>r.ok)?'online':'offline', fingerprint=streamFingerprint(streams);
  const row={channel_id:id,fingerprint,status,checked_at:new Date().toISOString(),details:results};
  await query(`INSERT INTO channel_health(channel_id,fingerprint,status,details) VALUES($1,$2,$3,$4) ON CONFLICT(channel_id) DO UPDATE SET fingerprint=EXCLUDED.fingerprint,status=EXCLUDED.status,details=EXCLUDED.details,checked_at=now()`,[id,fingerprint,status,JSON.stringify(results)]);
  health.set(id,row);return {...channelStatus(id,streams),results};
}
