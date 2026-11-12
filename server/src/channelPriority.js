const names=[/^npy$/,/^snt$/,/^c9n$/,/^abc[ -]?tv(?: paraguay)?$/,/^rcc(?: tv)?$/,/^la\s?tele$/];
export function channelPriority(c){
 if(c.country!=='PY')return 100;
 const index=names.findIndex(re=>re.test(String(c.name).toLowerCase().trim()));
 return index<0?100:index;
}
export const prioritizeChannels=items=>items.slice().sort((a,b)=>channelPriority(a)-channelPriority(b));
