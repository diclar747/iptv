const categories={todas:'',accion:'acción',drama:'drama',infantil:'infantil',familia:'familiar',comedia:'comedia',aventura:'aventura',animacion:'animación',cienciaficcion:'ciencia ficción',suspenso:'suspenso',terror:'terror',romance:'romance',documental:'documental'};
function searchQuery(input={}){
 const text=String(input.query||'').trim().replace(/\s+/g,' ');if(text.length>160)throw Error('Usá una búsqueda de hasta 160 caracteres.');
 const category=String(input.category||'todas');if(!Object.hasOwn(categories,category))throw Error('Elegí una categoría válida.');
 const page=Number(input.page||1);if(!Number.isInteger(page)||page<1||page>5)throw Error('La búsqueda permite hasta cinco páginas.');
 const query=[text,category==='documental'?'documental completo en español':'película completa en español',categories[category]].filter(Boolean).join(' ');
 return {query,page,category,text};
}
function searchResults(info){return (info.entries||[]).filter(e=>e&&/^[-\w]{11}$/.test(e.id||'')&&!e.is_live&&e.live_status!=='is_live').map(e=>({id:e.id,title:String(e.title||'Video sin título').slice(0,300),url:'https://www.youtube.com/watch?v='+e.id,channel:String(e.channel||e.uploader||'').slice(0,150),duration:Number(e.duration)||null,thumbnail:(e.thumbnails||[]).findLast(t=>/^https:\/\/[^/]*ytimg\.com\//.test(t.url||''))?.url||'https://i.ytimg.com/vi/'+e.id+'/hqdefault.jpg'}));}
function createSearch(run,bin,common){const cache=new Map(),pending=new Map();return async input=>{
 const s=searchQuery(input),key=JSON.stringify(s),old=cache.get(key);if(old&&Date.now()-old.at<300000)return old.result;if(pending.has(key))return pending.get(key);if(pending.size>=2)throw Error('Hay otra búsqueda en curso. Esperá un momento.');
 const promise=(async()=>{const start=(s.page-1)*12+1,end=s.page*12;let info;
  try{const raw=await run(bin,[...common().filter(a=>a!=='--no-playlist'),'--flat-playlist','--dump-single-json','--skip-download','--playlist-start',String(start),'--playlist-end',String(end),'--','ytsearch'+end+':'+s.query],60000);info=JSON.parse(raw);}catch(e){if(/confirm you.re not a bot|sign in to confirm/i.test(e.message))throw Error('YouTube pide verificar esta conexión. Podés abrir YouTube normalmente y usar un enlace disponible.');throw Error('No se pudo buscar en YouTube. Verificá la conexión e intentá nuevamente.');}
  const items=searchResults(info),result={items,page:s.page,hasMore:items.length===12&&s.page<5,query:s.query};if(cache.size>=50)cache.delete(cache.keys().next().value);cache.set(key,{result,at:Date.now()});return result;
 })();pending.set(key,promise);try{return await promise;}finally{pending.delete(key);}
};}
module.exports={searchQuery,searchResults,createSearch};
