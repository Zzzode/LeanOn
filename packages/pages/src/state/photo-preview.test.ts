import {expect,test} from '@rstest/core';
import {createLeanOnBridgeClient,createMemoryBridge} from '@zzzode/bridge';
import {createPhotoPreviewLoader,invalidatePhotoPreviews,updatePhotoLifecycle,initialPhotoPreviewLifecycle,type PhotoPreviewState} from './photo-preview.js';
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();};

test('only strict cache scopes invalidate previews; unrelated records and malformed payloads never trigger rereads',()=>{
  const initial={...initialPhotoPreviewLifecycle};
  for(const payload of [null,[],{scope:'other'},{scope:'own',extra:true},{hostData:{}},{scope:{toString:()=> 'all'}}])expect(invalidatePhotoPreviews(initial,payload)).toBe(initial);
  expect(invalidatePhotoPreviews(initial,{scope:'own'})).toEqual({own:1,partner:0,paused:false});
  expect(invalidatePhotoPreviews(initial,{scope:'partner'})).toEqual({own:0,partner:1,paused:false});
});
test('native background and invalidation preserve suspension; foreground resumes without changing a draft',()=>{
  const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);let lifecycle={...initialPhotoPreviewLifecycle};
  const draft={date:'2026-10-05',note:'Unsaved local note',view:'side'};
  bridge.subscribe('app.lifecycle',payload=>{lifecycle=updatePhotoLifecycle(lifecycle,payload);});
  bridge.subscribe('app.photoPreviewsInvalidated',payload=>{lifecycle=invalidatePhotoPreviews(lifecycle,payload);});
  memory.emit('app.lifecycle',{state:'background'});memory.emit('app.photoPreviewsInvalidated',{scope:'all'});
  expect(lifecycle).toEqual({own:1,partner:1,paused:true});
  memory.emit('app.lifecycle',{state:'foreground'});expect(lifecycle).toEqual({own:2,partner:2,paused:false});
  expect(draft).toEqual({date:'2026-10-05',note:'Unsaved local note',view:'side'});
  expect(updatePhotoLifecycle({...lifecycle,paused:true},{state:{toString:()=> 'foreground'}}).paused).toBe(true);
});
test('same photo after cache cleanup uses a new read and late prior responses or image errors cannot resurrect its old URI',async()=>{
  const states:PhotoPreviewState[]=[];const loader=createPhotoPreviewLoader(state=>states.push(state));
  let oldResolve!:(value:string)=>void;let reads=0;
  const stop=loader.load('photo-1',()=>{reads++;return new Promise(resolve=>{oldResolve=resolve;});});await flush();
  stop();loader.load('photo-1',async()=>{reads++;return 'file:///fresh-generation.jpg';});await flush();
  const fresh=states[states.length-1]!;expect(fresh.uri).toBe('file:///fresh-generation.jpg');
  oldResolve('file:///deleted-old.jpg');await flush();expect(states[states.length-1]).toBe(fresh);
  loader.imageFailed('file:///deleted-old.jpg',fresh.generation-1);expect(states[states.length-1]).toBe(fresh);expect(reads).toBe(2);
});
test('background suspension drops pending plaintext URI and image failure requires one explicit retry with no automatic fetch loop',async()=>{
  const states:PhotoPreviewState[]=[];const loader=createPhotoPreviewLoader(state=>states.push(state));let resolve!:(value:string)=>void;let reads=0;
  loader.load('photo-1',()=>{reads++;return new Promise(done=>{resolve=done;});});await flush();loader.suspend();
  resolve('file:///background-stale.jpg');await flush();expect(states[states.length-1]?.uri).toBeNull();expect(reads).toBe(1);
  loader.load('photo-1',async()=>{reads++;return 'file:///visible.jpg';});await flush();const visible=states[states.length-1]!;
  loader.imageFailed(visible.uri!,visible.generation);await flush();expect(states[states.length-1]?.error).toBe(true);expect(reads).toBe(2);
  loader.load('photo-1',async()=>{reads++;return 'file:///retried.jpg';});await flush();expect(states[states.length-1]?.uri).toBe('file:///retried.jpg');expect(reads).toBe(3);
});
test('failed preview reads stay an explicit error until retry; cancelling an unmounted gallery suppresses late replies',async()=>{
  const states:PhotoPreviewState[]=[];const loader=createPhotoPreviewLoader(state=>states.push(state));let reads=0;
  loader.load('photo-1',async()=>{reads++;throw new Error('Permission/cache revoked');});await flush();expect(states[states.length-1]?.error).toBe(true);expect(reads).toBe(1);
  let resolve!:(value:string)=>void;const stop=loader.load('photo-1',()=>new Promise(done=>{resolve=done;}));await flush();stop();const current=states[states.length-1];resolve('file:///unmounted.jpg');await flush();expect(states[states.length-1]).toBe(current);
});
