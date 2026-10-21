import {expect,test} from '@rstest/core';
import {photoPage} from './photo-page.js';
import {createPhotoPreviewLoader,type PhotoPreviewState} from './photo-preview.js';
const flush=async()=>{for(let n=0;n<4;n++)await Promise.resolve();};

test('a 1000-photo gallery exposes at most four previews per page without dropping or changing metadata',()=>{
  const photos=Array.from({length:1000},(_,id)=>({id:`photo-${id}`,note:`note-${id}`}));
  const seen:string[]=[];
  for(let index=0;index<250;index++){
    const page=photoPage(photos,index);expect(page.totalPages).toBe(250);expect(page.items).toHaveLength(4);
    for(const photo of page.items)seen.push(photo.id);
  }
  expect(seen).toEqual(photos.map(photo=>photo.id));expect(new Set(seen).size).toBe(1000);
  expect(photos[0]).toEqual({id:'photo-0',note:'note-0'});
});
test('deleting the last page clamps to the remaining page; empty and invalid page requests are safe',()=>{
  expect(photoPage([1,2,3,4,5],20)).toMatchObject({items:[5],index:1,previous:true,next:false});
  expect(photoPage([1,2,3,4],1)).toMatchObject({items:[1,2,3,4],index:0,totalPages:1});
  expect(photoPage([],5)).toMatchObject({items:[],index:0,totalPages:0,previous:false,next:false});
  expect(photoPage([1,2,3,4,5],NaN).items).toEqual([1,2,3,4]);
});
test('changing pages cancels old preview readers and rejects their late image responses',async()=>{
  const photos=Array.from({length:1000},(_,id)=>`photo-${id}`);const states:PhotoPreviewState[][]=[];
  const late:Array<(uri:string)=>void>=[];let reads=0;
  const stops=photoPage(photos,0).items.map((id,index)=>{
    states[index]=[];return createPhotoPreviewLoader(state=>states[index]!.push(state)).load(id,()=>{reads++;return new Promise(resolve=>late.push(resolve));});
  });
  await flush();expect(reads).toBe(4);stops.forEach(stop=>stop());
  const before=states.map(values=>values.length);
  photoPage(photos,1).items.forEach(id=>createPhotoPreviewLoader(()=>{}).load(id,async()=>{reads++;return `file:///${id}`;}));
  await flush();late.forEach(resolve=>resolve('file:///old.jpg'));await flush();
  expect(reads).toBe(8);expect(states.map(values=>values.length)).toEqual(before);
});
