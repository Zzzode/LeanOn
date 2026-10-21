import { describe, expect, it } from '@rstest/core';
import { createSignedOutCompanionState, hasCurrentCompanionSession, isCompanionMessage, isCompanionPeerSnapshot, isCompanionState, isCompanionResponse } from './companion.js';
import type { CompanionStateDto } from './companion.js';
import { defaultShareSettings, isShared } from './privacy.js';
import { withoutCredentials } from './validation.js';
describe('truthful companion state',()=>{
  it('rejects private deletion capabilities in extensible backup preferences',()=>{
    for(const key of ['pendingAccountDeletion','deletion_proof','capability-proof','deleteCapability','proof']) {
      expect(withoutCredentials({preferences:{nested:{[key]:'public rejection fixture'}}})).toBe(false);
    }
    expect(withoutCredentials({accountDeletion:{phase:'confirmed',accountId:'fixture',deleteLocalData:false}})).toBe(true);
  });
  it('exposes only bounded deletion recovery status, including after sign-out',()=>{
    const runtime={endpoint:null,deviceAuthorized:false,localDataAccountId:null,syncState:'idle',pendingChanges:0,lastSyncAt:null,nativeNow:'2026-10-07T12:00:00Z',errorCode:null,accountDeletion:null};
    const response={companion:createSignedOutCompanionState(),runtime};
    expect(isCompanionResponse(response)).toBe(true);
    const deletion={phase:'confirmed',accountId:'deleted-account',displayName:'Public fixture',deleteLocalData:true,localDataChanged:true};
    expect(isCompanionResponse({...response,runtime:{...runtime,accountDeletion:deletion}})).toBe(true);
    for(const invalid of [{...deletion,proof:'private'},{...deletion,operationId:'private'},{...deletion,expectedRecordsRevision:1},{...deletion,phase:'done'},{...deletion,localDataChanged:undefined},{...deletion,displayName:' '}]) {
      expect(isCompanionResponse({...response,runtime:{...runtime,accountDeletion:invalid}})).toBe(false);
    }
    expect(isCompanionResponse({...response,runtime:{...runtime,accountDeletion:undefined}})).toBe(false);
  });
  it('starts private including encouragement and body measurements',()=>{
    const state=createSignedOutCompanionState();expect(isCompanionState(state)).toBe(true);
    expect(isShared(defaultShareSettings(),'encouragement')).toBe(false);expect(isShared(defaultShareSettings(),'body_measurements')).toBe(false);
  });
  it('does not accept a claimed delivery without a receipt timestamp',()=>{
    const message={id:'m',text:'Want to walk together?',createdAt:'2026-10-07T12:00:00Z',direction:'outgoing'};
    expect(isCompanionMessage({...message,status:'pending'})).toBe(true);expect(isCompanionMessage({...message,status:'delivered'})).toBe(false);
    expect(isCompanionMessage({...message,status:'delivered',deliveredAt:'2026-10-07T12:01:00Z'})).toBe(true);
    // A real receipt can predate the sender's clock when that device runs ahead.
    expect(isCompanionMessage({...message,status:'delivered',deliveredAt:'2026-10-07T11:59:00Z'})).toBe(true);
    expect(isCompanionMessage({...message,status:'delivered',deliveredAt:'not-a-date'})).toBe(false);
  });
  it('rejects health fields absent explicit category grants',()=>{
    expect(isCompanionPeerSnapshot({updatedAt:'2026-10-07T12:00:00Z',sharedCategories:[],exactWeightKg:80})).toBe(false);
    expect(isCompanionPeerSnapshot({updatedAt:'2026-10-07T12:00:00Z',sharedCategories:['exact_weight'],exactWeightKg:80})).toBe(true);
    expect(isCompanionPeerSnapshot({updatedAt:'2026-10-07T12:00:00Z',sharedCategories:[],measurements:[{id:'m',date:'2026-10-07',waistCm:90}]})).toBe(false);
  });
  it('keeps accepted invitations pending without inventing a binding',()=>{
    const state:CompanionStateDto={...createSignedOutCompanionState(),account:{id:'a',displayName:'A'},sessionExpiresAt:'2026-10-07T13:00:00Z',invitations:[{id:'i',kind:'family',direction:'outgoing',status:'awaiting-confirmation',expiresAt:'2026-10-07T13:00:00Z',recipientId:'b',recipientDeviceId:'device-b'}]};
    expect(isCompanionState(state)).toBe(true);expect(state.binding).toBe(null);expect(hasCurrentCompanionSession(state,'2026-10-07T12:00:00Z')).toBe(true);expect(hasCurrentCompanionSession(state,'2026-10-07T14:00:00Z')).toBe(false);
    expect(isCompanionState({...state,token:'plaintext secret'})).toBe(false);
  });
});
