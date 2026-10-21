import {expect,test} from '@rstest/core';
import {createLeanOnBridgeClient,createMemoryBridge} from '@zzzode/bridge';
import {createEmptyPersonalState,createSignedOutCompanionState,type CompanionResponseDto} from '@zzzode/data';
import {sampleHostData} from './sample.js';
import {attachmentAction,localAttachmentPreview} from './local-attachment.js';
import {invokeCompanionAction} from './companion-client.js';
function view(account='a'):CompanionResponseDto {return {companion:{...createSignedOutCompanionState(),account:{id:account,displayName:account},sessionExpiresAt:'2026-10-08T10:00:00Z'},runtime:{endpoint:'http://localhost:8787',localDataAccountId:null,deviceAuthorized:true,syncState:'idle',pendingChanges:0,lastSyncAt:null,nativeNow:'2026-10-07T10:00:00Z',errorCode:null,accountDeletion:null}};}
test('login and sync cannot imply consent; named-account changes invalidate an approved local preview',()=>{
  const preview=localAttachmentPreview(sampleHostData,createEmptyPersonalState());
  expect(attachmentAction(preview,'a',view(),false)).toBeNull();expect(attachmentAction(undefined,'a',view(),true)).toBeNull();
  expect(attachmentAction(preview,'a',view('b'),true)).toBeNull();expect(attachmentAction(preview,'a',{...view(),runtime:{...view().runtime,deviceAuthorized:false}},true)).toBeNull();
});
test('explicit attachment sends pinned dual CAS revisions and preserves native queued status',async()=>{
  const preview=localAttachmentPreview({...sampleHostData,revision:7},{...createEmptyPersonalState(),revision:3});
  const action=attachmentAction(preview,'a',view(),true);expect(action).not.toBeNull();
  const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);let sent:unknown;
  const queued={...view(),runtime:{...view().runtime,localDataAccountId:'a',pendingChanges:2}};
  memory.handle('companion.attachLocalData',request=>{sent=request;return queued;});
  const result=await invokeCompanionAction(bridge,action!);expect(sent).toEqual({expectedRecordsRevision:7,expectedPersonalRevision:3});
  expect(result.view.runtime.pendingChanges).toBe(2);expect(result.view.runtime.lastSyncAt).toBeNull();
});
