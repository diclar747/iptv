// Playback and checking must use the same browser headers and candidate order.
export const RADIO_USER_AGENT='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
export function radioSources(station){
 return [...new Set([station.preferredSource,station.url,...(station.alternativeSources||[])].filter(u=>typeof u==='string'&&/^https?:\/\//i.test(u)))].slice(0,5);
}
export function radioReferrer(station,url){
 return /^https?:\/\/(www\.)?desdeparaguay\.com\//i.test(url)?url:station.source||undefined;
}
