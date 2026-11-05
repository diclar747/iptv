import test from 'node:test';import assert from 'node:assert/strict';
import {parseYoutubeUrl,sanitizeMetadata} from './youtube-downloader.js';
import {libraryReference} from './media-library.js';
test('accepts one YouTube video and strips playlist or tracking parameters',()=>{
 assert.equal(parseYoutubeUrl('https://youtu.be/YE7VzlLtp-4?si=test').url,'https://www.youtube.com/watch?v=YE7VzlLtp-4');
 assert.equal(parseYoutubeUrl('https://www.youtube.com/watch?v=YE7VzlLtp-4&list=PLtest').id,'YE7VzlLtp-4');
 for(const bad of ['http://youtube.com/watch?v=YE7VzlLtp-4','https://youtube.com.evil.test/watch?v=YE7VzlLtp-4','https://127.0.0.1/watch?v=YE7VzlLtp-4','https://www.youtube.com/playlist?list=x','https://user:pass@youtube.com/watch?v=YE7VzlLtp-4','https://youtube.com:444/watch?v=YE7VzlLtp-4'])assert.throws(()=>parseYoutubeUrl(bad));
});
test('keeps editorial facts and attribution without inventing a film release year',()=>{
 const m=sanitizeMetadata({id:'YE7VzlLtp-4',title:'Fixture',description:'Descripción 👋',uploader:'Autor',duration:120,upload_date:'20260101',formats:[{url:'https://temporary.test/?secret=x'}]});
 assert.equal(m.creator,'Autor');assert.equal(m.year,null);assert.equal(m.uploadDate,'20260101');assert.equal(m.duration,120);assert.equal(m.formats,undefined);assert.equal(m.license,'No indicada');
 assert.throws(()=>sanitizeMetadata({is_live:true}),/terminado/);
});
test('private library accepts only its own origin and generated asset paths',()=>{
 assert.equal(libraryReference('https://evil.test/api/library/123/video.mp4'),null);
 assert.equal(libraryReference('https://live.cd.com.py/api/library/../../etc/passwd'),null);
});
