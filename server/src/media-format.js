// Preserve codecs. Change only the container when that improves direct playback.
export function originalMediaPlan(probe){
 const video=probe.streams?.find(s=>s.codec_type==='video'),audio=probe.streams?.find(s=>s.codec_type==='audio');
 const formats=String(probe.format?.format_name||'').split(',');
 if(formats.some(f=>['mov','mp4','m4a','3gp','3g2','mj2'].includes(f)))return {file:'video.mp4',remux:false,mime:'video/mp4'};
 if(['vp8','vp9','av1'].includes(video?.codec_name)&&(!audio||['opus','vorbis'].includes(audio.codec_name)))return {file:'video.webm',remux:true,mime:'video/webm'};
 if(video?.codec_name==='h264'&&(!audio||['aac','mp3'].includes(audio.codec_name)))return {file:'video.mp4',remux:true,mime:'video/mp4'};
 return {file:'video.mkv',remux:false,mime:'video/x-matroska'};
}
export function mediaMime(file){return file.endsWith('.webm')?'video/webm':file.endsWith('.mkv')?'video/x-matroska':'video/mp4';}
