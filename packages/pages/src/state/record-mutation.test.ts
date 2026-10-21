import { expect, test } from '@rstest/core';
import { createLeanOnBridgeClient, createMemoryBridge, type RecordsMutationRequest } from '@zzzode/bridge';
import { openRecordDraft, saveRecordDraft } from './record-mutation.js';
import { sampleHostData } from './sample.js';

test('a historical draft keeps its opening date and revision after midnight and new records', () => {
  const draft = openRecordDraft({ ...sampleHostData, revision: 7 }, '2026-09-30', 'meal-original');
  const refreshed = { ...sampleHostData, today:'2026-10-02', revision:8 };
  expect(draft).toMatchObject({date:'2026-09-30',revision:7,id:'meal-original'});
  expect(openRecordDraft(refreshed)).toMatchObject({date:'2026-10-02',revision:8});
});

test('a response lost after persistence retries the same operation and never rebases stale revisions', async () => {
  const memory=createMemoryBridge(); const requests:RecordsMutationRequest[]=[];
  memory.handle<RecordsMutationRequest,unknown>('records.mutate', request=>{
    requests.push(request);
    if(requests.length===1) throw {code:'internal-error',message:'Response interrupted'};
    return {success:true,hostData:{...sampleHostData,revision:8},appliedRevision:8,replayed:true};
  });
  const bridge=createLeanOnBridgeClient(memory.transport);
  const draft=openRecordDraft({...sampleHostData,revision:7},'2026-09-30');
  const mutation={type:'set-weight' as const,date:draft.date,weightKg:79};
  await expect(saveRecordDraft(bridge,draft,mutation)).rejects.toBeDefined();
  expect((await saveRecordDraft(bridge,draft,mutation)).hostData.revision).toBe(8);
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[1]?.expectedRevision).toBe(7);
  await saveRecordDraft(bridge,draft,{...mutation,weightKg:78});
  expect(requests[2]?.operationId).not.toBe(requests[0]?.operationId);
  expect(requests[2]?.expectedRevision).toBe(7);
});

test('a corrupt success snapshot cannot close a draft as successfully saved', async () => {
  const memory=createMemoryBridge();memory.handle('records.mutate',()=>({success:true,hostData:{},appliedRevision:1,replayed:false}));
  await expect(saveRecordDraft(createLeanOnBridgeClient(memory.transport),openRecordDraft(sampleHostData),{type:'set-water',date:sampleHostData.today,amountMl:250})).rejects.toThrow('Invalid record mutation response');
});

test('creating a custom food advances only its own revision while preserving the pinned meal draft', async () => {
  const {advanceDraftAfterAuxiliary}=await import('./record-mutation.js');
  const draft=openRecordDraft({...sampleHostData,revision:7},'2026-09-30','meal-stable');
  const saved={...sampleHostData,revision:8};
  expect(advanceDraftAfterAuxiliary(draft,7,saved,saved)).toBe(true);
  expect(draft).toMatchObject({date:'2026-09-30',revision:8,id:'meal-stable'});
  const memory=createMemoryBridge();let received:RecordsMutationRequest|undefined;
  memory.handle<RecordsMutationRequest,unknown>('records.mutate',request=>{received=request;return {success:true,hostData:{...saved,revision:9},appliedRevision:9,replayed:false};});
  await saveRecordDraft(createLeanOnBridgeClient(memory.transport),draft,{type:'save-intake',entry:{id:draft.id,date:draft.date,meal:'snack',name:'Original food label',grams:100,kcal:200,macros:{proteinG:4,carbsG:20,fatG:10},micros:{fiberG:2,sugarG:4,saturatedFatG:1,sodiumMg:30}}});
  expect(received?.expectedRevision).toBe(8);
  expect(received?.mutation).toMatchObject({entry:{date:'2026-09-30',id:'meal-stable',name:'Original food label'}});
});

test('stale auxiliary responses and ambiguous generic failures cannot silently rebase a draft', async () => {
  const {advanceDraftAfterAuxiliary,newestRecordSnapshot}=await import('./record-mutation.js');
  const draft=openRecordDraft({...sampleHostData,revision:7});
  const oldAux={...sampleHostData,revision:8};const external={...sampleHostData,revision:9};
  expect(newestRecordSnapshot(external,oldAux)).toBe(external);
  expect(advanceDraftAfterAuxiliary(draft,7,oldAux,external)).toBe(false);
  expect(advanceDraftAfterAuxiliary(draft,7,external,external)).toBe(false);
  draft.request={operationId:'ambiguous',expectedRevision:7,mutation:{type:'set-water',date:draft.date,amountMl:250}};
  expect(advanceDraftAfterAuxiliary(draft,7,oldAux,oldAux)).toBe(false);
  expect(draft.revision).toBe(7);
});

test('explicit conflict review preserves operation identity and date while permitting a reviewed retry', async () => {
  const {reviewConflictedDraft}=await import('./record-mutation.js');
  const memory=createMemoryBridge();const requests:RecordsMutationRequest[]=[];
  memory.handle<RecordsMutationRequest,unknown>('records.mutate',request=>{requests.push(request);if(request.expectedRevision<9)throw {code:'conflict',message:'Changed'};return {success:true,hostData:{...sampleHostData,revision:10},appliedRevision:10,replayed:false};});
  const bridge=createLeanOnBridgeClient(memory.transport);const draft=openRecordDraft({...sampleHostData,revision:7},'2026-09-30');
  const mutation={type:'set-weight' as const,date:draft.date,weightKg:79};
  await expect(saveRecordDraft(bridge,draft,mutation)).rejects.toMatchObject({code:'conflict'});
  reviewConflictedDraft(draft,9);
  await saveRecordDraft(bridge,draft,mutation);
  expect(requests[1]?.operationId).toBe(requests[0]?.operationId);
  expect(requests[1]?.expectedRevision).toBe(9);
  expect(requests[1]?.mutation).toEqual(requests[0]?.mutation);
  expect(draft.date).toBe('2026-09-30');
});

test('a native clock event received during a save survives the late response at the same storage revision', async () => {
  const {newestRecordSnapshot}=await import('./record-mutation.js');
  const memory=createMemoryBridge();
  let finish:(value:unknown)=>void=()=>{};
  memory.handle<RecordsMutationRequest,unknown>('records.mutate',()=>new Promise(resolve=>{finish=resolve;}));
  const bridge=createLeanOnBridgeClient(memory.transport);
  let current={...sampleHostData,revision:7,today:'2026-10-06',todayHour:23,streak:10};
  let presentationSequence=0;
  bridge.subscribe('records.changed',payload=>{current=newestRecordSnapshot(current,payload.hostData) as typeof current;presentationSequence+=1;});
  const draft=openRecordDraft(current,'2026-10-05');
  const requestStartedAt=presentationSequence;
  const pending=saveRecordDraft(bridge,draft,{type:'set-water',date:draft.date,amountMl:500});
  memory.emit('records.changed',{hostData:{...current,revision:8,today:'2026-10-07',todayHour:0,streak:11}});
  const savedWater={id:'water-2026-10-05',date:'2026-10-05',amountMl:500};
  finish({success:true,hostData:{...sampleHostData,revision:8,today:'2026-10-06',todayHour:23,streak:10,water:[savedWater]},appliedRevision:8,replayed:false});
  const result=await pending;
  current=newestRecordSnapshot(current,result.hostData,{requestStartedAt,currentSequence:presentationSequence}) as typeof current;
  expect(current).toMatchObject({revision:8,today:'2026-10-07',todayHour:0,streak:11,water:[savedWater]});
  expect(draft.date).toBe('2026-10-05');
});

test('equal-revision native clock updates can legitimately move backward and stale responses do not reverse them', async () => {
  const {newestRecordSnapshot}=await import('./record-mutation.js');
  const before={...sampleHostData,revision:8,today:'2026-10-07',todayHour:2,streak:11};
  const westward={...before,today:'2026-10-06',todayHour:18,streak:10};
  const current=newestRecordSnapshot(before,westward);
  expect(current).toBe(westward);
  const late=newestRecordSnapshot(current,before,{requestStartedAt:4,currentSequence:5});
  expect(late).toMatchObject({today:'2026-10-06',todayHour:18,streak:10});
  expect(newestRecordSnapshot(current,before,{requestStartedAt:5,currentSequence:5})).toBe(before);
  const withoutHour={...westward};delete (withoutHour as {todayHour?:number}).todayHour;
  expect(newestRecordSnapshot(withoutHour,before,{requestStartedAt:4,currentSequence:5}).todayHour).toBeUndefined();
});

test('an open draft recovers a transient failed read before retrying its exact interrupted operation', async () => {
  const {saveRecordDraftWithRecovery}=await import('./record-mutation.js');
  const memory=createMemoryBridge();const requests:RecordsMutationRequest[]=[];let corrupt=true;
  memory.handle('records.getSnapshot',()=>corrupt?{hostData:{}}:{hostData:{...sampleHostData,revision:7}});
  memory.handle<RecordsMutationRequest,unknown>('records.mutate',request=>{
    requests.push(request);
    if(requests.length===1)throw {code:'unavailable',message:'Local file unavailable'};
    return {success:true,hostData:{...sampleHostData,revision:8},appliedRevision:8,replayed:false};
  });
  const bridge=createLeanOnBridgeClient(memory.transport);
  const draft=openRecordDraft({...sampleHostData,revision:7},'2026-09-30','water-original');
  const mutation={type:'set-water' as const,date:draft.date,amountMl:500};
  await expect(saveRecordDraft(bridge,draft,mutation)).rejects.toMatchObject({code:'unavailable'});
  const originalRequest=draft.request;
  const readSnapshots:unknown[]=[];
  await expect(saveRecordDraftWithRecovery(bridge,draft,mutation,true,data=>readSnapshots.push(data))).rejects.toThrow('Invalid recovery snapshot');
  expect(requests).toHaveLength(1);
  expect(draft.request).toBe(originalRequest);
  expect(readSnapshots).toEqual([]);
  corrupt=false;
  const result=await saveRecordDraftWithRecovery(bridge,draft,mutation,true,data=>readSnapshots.push(data));
  expect(result.hostData.revision).toBe(8);
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[1]?.expectedRevision).toBe(7);
  expect(draft.date).toBe('2026-09-30');
  expect(readSnapshots).toHaveLength(1);
});

test('recovery reads a changed latest journal but leaves the old revision to produce an explicit conflict', async () => {
  const {saveRecordDraftWithRecovery}=await import('./record-mutation.js');
  const memory=createMemoryBridge();let received:RecordsMutationRequest|undefined;
  memory.handle('records.getSnapshot',()=>({hostData:{...sampleHostData,revision:9,today:'2026-10-07'}}));
  memory.handle<RecordsMutationRequest,unknown>('records.mutate',request=>{received=request;throw {code:'conflict',message:'Journal changed'};});
  const draft=openRecordDraft({...sampleHostData,revision:7},'2026-09-30');
  const mutation={type:'set-weight' as const,date:draft.date,weightKg:79};
  const originalRequest={operationId:'interrupted-save',expectedRevision:7,mutation};draft.request=originalRequest;
  let readRevision=0;
  await expect(saveRecordDraftWithRecovery(createLeanOnBridgeClient(memory.transport),draft,mutation,true,data=>{readRevision=data.revision;})).rejects.toMatchObject({code:'conflict'});
  expect(readRevision).toBe(9);
  expect(received).toBe(originalRequest);
  expect(draft).toMatchObject({revision:7,date:'2026-09-30',request:originalRequest});
});
