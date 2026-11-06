import {readFileSync} from 'node:fs';

// Reviewed catalog assets. No remote fetch is performed during a viewer request.
const artwork=JSON.parse(readFileSync(new URL('./channel-art.json',import.meta.url),'utf8'));
const base=(process.env.PUBLIC_BASE_URL||'https://live.cd.com.py').replace(/\/$/,'');
export function channelArtwork(id,original){
 const entry=artwork[id];
 // Preserve a logo customized by the administrator after this snapshot.
 return entry&&entry.source===original?base+entry.url:original;
}
