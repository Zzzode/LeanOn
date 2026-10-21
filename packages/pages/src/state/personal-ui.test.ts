import { expect,test } from '@rstest/core';
import { createEmptyPersonalState,applyPersonalMutation,type PersonalMutationRequestDto } from '@zzzode/data';
import { createLeanOnBridgeClient,createMemoryBridge } from '@zzzode/bridge';
import { measurementDraft,measurementFromDraft,photoMetadataDraft,personalRequest,photoPickRequest,reviewPersonalRequest } from './personal-ui.js';
import { readPersonal,newestPersonal,savePersonal } from './personal-client.js';

test('measurements omit unknown dimensions and reject invalid or future values',()=>{
  const draft=measurementDraft(null,'2026-10-07');draft.hipCm='95.5';
  expect(measurementFromDraft(draft,'m1','2026-10-07')).toEqual({id:'m1',date:'2026-10-07',hipCm:95.5});
  expect(measurementFromDraft({...draft,waistCm:'0'},'m1','2026-10-07')).toBeNull();
  expect(measurementFromDraft({...draft,date:'2026-10-08'},'m1','2026-10-07')).toBeNull();
  expect(measurementFromDraft({...draft,hipCm:''},'m1','2026-10-07')).toBeNull();
});
test('photo date/view/note editing preserves file identity and immutable image metadata',()=>{
  const photo={id:'p1',date:'2026-10-06',view:'front' as const,note:'old',createdAt:'2026-10-06T10:00:00Z',mime:'image/jpeg' as const,width:300,height:500};
  expect(photoMetadataDraft(photo,'2026-10-07','side','','2026-10-07')).toEqual({...photo,date:'2026-10-07',view:'side',note:undefined});
  expect(photoMetadataDraft(photo,'2026-10-08','side','new','2026-10-07')).toBeNull();
});
test('ambiguous save retry retains operation/revision and native replay creates only one measurement',async()=>{
  const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);let state=createEmptyPersonalState();let first=true;
  memory.handle('personal.mutate',request=>{const result=applyPersonalMutation(state,request as PersonalMutationRequestDto);state=result.personal;if(first){first=false;throw {code:'unavailable',message:'Lost reply'};}return {success:true,...result};});
  const mutation={type:'save-measurement' as const,measurement:{id:'m1',date:'2026-10-07',waistCm:80}};
  const original=personalRequest(null,0,mutation);
  await expect(savePersonal(bridge,original,false,()=>{})).rejects.toThrow();
  const retry=personalRequest(original,100,mutation);expect(retry).toBe(original);expect(retry.expectedRevision).toBe(0);
  expect((await savePersonal(bridge,retry,false,()=>{})).measurements).toHaveLength(1);expect(state.revision).toBe(1);
});
test('read recovery keeps stale draft revision for explicit conflict instead of silent overwrite',async()=>{
  const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);let written:unknown;const state={...createEmptyPersonalState(),revision:5};
  memory.handle('personal.getState',()=>({personal:state}));memory.handle('personal.mutate',request=>{written=request;throw {code:'conflict',message:'Changed'};});
  const request=personalRequest(null,2,{type:'delete-measurement',id:'m1'});let recovered=false;
  await expect(savePersonal(bridge,request,true,()=>{recovered=true;})).rejects.toMatchObject({code:'conflict'});
  expect(recovered).toBe(true);expect(written).toEqual(request);expect(request.expectedRevision).toBe(2);
});
test('malformed reads block writes and lower revision responses cannot replace newer personal data',async()=>{
  const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);let writes=0;
  memory.handle('personal.getState',()=>({personal:{}}));memory.handle('personal.mutate',()=>{writes++;throw new Error('Unexpected');});
  const request=personalRequest(null,0,{type:'delete-measurement',id:'m1'});
  await expect(savePersonal(bridge,request,true,()=>{})).rejects.toThrow();expect(writes).toBe(0);expect(readPersonal({personal:{}})).toBeNull();
  const newer={...createEmptyPersonalState(),revision:3};expect(newestPersonal(newer,createEmptyPersonalState())).toBe(newer);
});

test('photo import retry keeps its operation and reviewed revision; editing metadata starts a new operation',()=>{
  const original=photoPickRequest(null,2,'2026-10-07','front','note');
  reviewPersonalRequest(original,{...createEmptyPersonalState(),revision:5});
  const retry=photoPickRequest(original,2,'2026-10-07','front','note');expect(retry).toBe(original);expect(retry.expectedRevision).toBe(5);
  const edited=photoPickRequest(original,2,'2026-10-07','side','note');expect(edited.operationId).not.toBe(original.operationId);expect(edited.expectedRevision).toBe(2);
});
