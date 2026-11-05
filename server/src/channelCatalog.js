import {manualCards} from './manualChannels.js';
import {queryChannels} from './iptvSource.js';
export async function queryPublicChannels({country,category,search,prefer,status,page=1,pageSize=10,includeNsfw=false,onlyWithStreams=true}={}){
 const size=Math.min(100,Math.max(1,parseInt(pageSize)||10)),number=Math.max(1,parseInt(page)||1);
 let manual=await manualCards({country,category});
 const q=String(search||'').trim().toLowerCase();
 if(q)manual=manual.filter(c=>c.name.toLowerCase().includes(q));
 if(status)manual=manual.filter(c=>c.status===status);
 const offset=(number-1)*size,manualPage=manual.slice(offset,offset+size);
 const result=queryChannels({country,category,search,prefer,status,page:number,offset:Math.max(0,offset-manual.length),pageSize:size-manualPage.length,includeNsfw,onlyWithStreams});
 return {...result,items:[...manualPage,...result.items],total:result.total+manual.length,pageSize:size,pages:Math.ceil((result.total+manual.length)/size)};
}
