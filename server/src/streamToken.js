import crypto from 'node:crypto';
const SECRET=process.env.STREAM_SECRET||crypto.randomBytes(32).toString('hex');
const DAY=24*60*60*1000;
const signature=(url,expires)=>crypto.createHmac('sha256',SECRET).update(expires+'\n'+String(url)).digest('base64url');
export function streamToken(url,expiresAt=Date.now()+DAY){const expires=Math.floor(Number(expiresAt)/1000);return expires+'.'+signature(url,expires);}
export function tokenExpiresAt(token){if(typeof token!=='string'||token.length>100)return null;const [value,mac,...extra]=token.split('.');const seconds=Number(value);return !extra.length&&mac&&Number.isSafeInteger(seconds)&&seconds>0?seconds*1000:null;}
export function validToken(url,token){
 const expiry=tokenExpiresAt(token);if(!url||!expiry||expiry<=Date.now())return false;
 const expected=signature(url,Math.floor(expiry/1000)),actual=token.split('.')[1];
 return /^[A-Za-z0-9_-]{43}$/.test(actual)&&actual.length===expected.length&&crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected));
}
