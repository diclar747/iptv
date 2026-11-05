(()=>{
 const el=id=>document.getElementById(id);let current=null,busy=false;
 function duration(s){if(!s)return 'Duración no indicada';const m=Math.round(s/60);return m>=60?Math.floor(m/60)+' h '+m%60+' min':m+' min';}
 function status(s){el('movie-search-status').textContent=s;}
 function render(items){for(const r of items){const card=document.createElement('article');card.className='movie-result';
  const img=document.createElement('img');img.src=r.thumbnail;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';card.append(img);
  const body=document.createElement('div');body.className='movie-result-body';const title=document.createElement('h3');title.textContent=r.title;const meta=document.createElement('p');meta.textContent=[duration(r.duration),r.channel].filter(Boolean).join(' · ');body.append(title,meta);
  const actions=document.createElement('div');actions.className='movie-result-actions';const download=document.createElement('button');download.className='primary';download.textContent='↓ Descargar';
  download.onclick=()=>action(download,async()=>{const q=await api('batch',{urls:[r.url],quality:el('movie-quality').value});status(q.ids.length?'Descarga agregada. Podés seguir buscando; el progreso aparece en Tus descargas.':'Este video ya está en la cola.');await refresh();});
  const use=document.createElement('button');use.className='secondary';use.textContent='Usar enlace';use.onclick=()=>{document.getElementById('url').value=r.url;document.getElementById('url').dispatchEvent(new Event('input'));document.getElementById('url').scrollIntoView({behavior:'smooth',block:'center'});document.getElementById('url').focus();};
  const link=document.createElement('a');link.href=r.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Ver en YouTube ↗';actions.append(download,use,link);body.append(actions);card.append(body);el('movie-results').append(card);
 }}
 async function search(more=false){if(busy)return;busy=true;el('movie-search-button').disabled=true;el('movie-more').disabled=true;status('Buscando películas en YouTube…');
  try{const query=more?{...current,page:current.page+1}:{query:el('movie-query').value.trim(),category:el('movie-category').value,page:1};const result=await api('search',query);current=query;if(!more)el('movie-results').replaceChildren();render(result.items);el('movie-more').hidden=!result.hasMore;const count=el('movie-results').children.length;status(count?count+' resultados · Elegí un video para descargar o revisar en YouTube.':'No encontramos resultados para esta búsqueda. Probá otro título o categoría.');}
  catch(e){status(e.message);}finally{busy=false;el('movie-search-button').disabled=false;el('movie-more').disabled=false;}
 }
 el('movie-search-form').onsubmit=e=>{e.preventDefault();search();};el('movie-more').onclick=()=>search(true);
 el('movie-quality').onchange=()=>{const q=document.getElementById('quality');q.value=el('movie-quality').value;q.dispatchEvent(new Event('change'));};document.getElementById('quality').addEventListener('change',()=>{if(['720','1080','best'].includes(document.getElementById('quality').value))el('movie-quality').value=document.getElementById('quality').value;});
})();
