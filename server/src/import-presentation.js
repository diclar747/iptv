export function cleanImportedTitle(value){
 let s=String(value||'').replace(/\.(?:mp4|mkv|webm)$/i,'').replace(/\s*\[[-\w]{11}\]\s*$/,'').replace(/[｜|]/g,' | ').replace(/\s+/g,' ').trim();
 if(s.includes(' | '))s=s.split(' | ')[0].trim();
 s=s.replace(/^ESTRENO\s*(?:\(\d{4}\)|\d{4})?\s*[:!·-]?\s*/i,'').replace(/\s*[|,:·-]?\s*pel[ií]cula\s*,?\s*completa\b.*$/i,'').trim();
 if(s.length>8&&(s.match(/[A-ZÁÉÍÓÚÑ]/g)||[]).length/(s.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g)||[]).length>.7)s=s[0].toUpperCase()+s.slice(1).toLowerCase();
 return s||'Video importado';
}
export function cleanImportedOverview(value){
 let text=String(value||'').replace(/\r/g,'');const start=text.match(/(?:sinopsis|resumen|argumento)\s*[:：]\s*/i);
 if(start)text=text.slice(start.index+start[0].length);
 const lines=text.split(/\n+/).map(s=>s.trim()).filter(s=>{
  if(!s||/^(?:[━─═\s]+|https?:\/\/\S+|#.*)$/.test(s))return false;
  if(/suscr[ií]b|subscribe|s[ií]guenos|follow us|redes sociales|notificaciones|palabras clave|tags\s*:/i.test(s))return false;
  const count=(s.match(/pel[ií]cula[s]?/gi)||[]).length;
  if((s.match(/,/g)||[]).length>=8&&count>=5)return false;
  if((s.match(/#/g)||[]).length>=3)return false;
  if(/^(?:reparto|director|año|sobre el canal|s[ií]guenos|enlaces)\s*[:：]/i.test(s))return false;
  return true;
 });
 let result=lines.join('\n\n').replace(/https?:\/\/\S+/g,'').trim();
 if(result.length>1200){result=result.slice(0,1200);const end=result.lastIndexOf('. ');if(end>650)result=result.slice(0,end+1);else result=result.replace(/\s+\S*$/,'')+'…';}
 return result;
}
