import {expect,test} from '@rstest/core';
import {createLeanOnBridgeClient,createMemoryBridge} from '@zzzode/bridge';
import {createSignedOutCompanionState,type CompanionResponseDto} from '@zzzode/data';
import {invokeCompanionAction} from './companion-client.js';
import {readCompanionView,companionEndpointValid,canSendEncouragement,canConfirmInvitation} from './companion-ui.js';

function fixture():CompanionResponseDto{return {companion:createSignedOutCompanionState(),runtime:{endpoint:'http://localhost:8787',deviceAuthorized:false,localDataAccountId:null,syncState:'idle',pendingChanges:0,lastSyncAt:null,nativeNow:'2026-10-07T10:00:00Z',errorCode:null,accountDeletion:null}};}
function signedIn():CompanionResponseDto{const result=fixture();result.companion.account={id:'owner',displayName:'Alice'};result.companion.sessionExpiresAt='2026-10-08T10:00:00Z';result.runtime.deviceAuthorized=true;return result;}
test('real invitation acceptance remains pending until creator confirmation; creation code is not persisted into the view',async()=>{
  const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);const response=signedIn();
  response.companion.invitations=[{id:'invite-1',kind:'family',direction:'incoming',status:'awaiting-confirmation',expiresAt:'2026-10-07T11:00:00Z',recipientId:'owner',recipientDeviceId:'device-1'}];
  memory.handle('companion.acceptInvitation',()=>response);
  const accepted=await invokeCompanionAction(bridge,{type:'acceptInvitation',code:'secret-code'});
  expect(accepted.view.companion.binding).toBeNull();expect(accepted.view.companion.invitations).toHaveLength(1);
  memory.handle('companion.createInvitation',()=>({...response,invitationCode:'private-one-use-secret'}));
  const created=await invokeCompanionAction(bridge,{type:'createInvitation',kind:'family'});
  expect(created.invitationCode).toBe('private-one-use-secret');expect('invitationCode' in created.view).toBe(false);
});
test('creator confirmation requires recipient identity and unexpired native time',()=>{
  const invitation={id:'i',kind:'family' as const,direction:'outgoing' as const,status:'awaiting-confirmation' as const,expiresAt:'2026-10-07T11:00:00Z',recipientId:'recipient',recipientDeviceId:'device'};
  expect(canConfirmInvitation(invitation,'2026-10-07T10:00:00Z')).toBe(true);
  expect(canConfirmInvitation({...invitation,recipientDeviceId:null},'2026-10-07T10:00:00Z')).toBe(false);
  expect(canConfirmInvitation(invitation,'2026-10-07T12:00:00Z')).toBe(false);
});
test('encouragement needs both grants; a queued HTTP response never becomes delivered without recipient ACK',async()=>{
  const response=signedIn();response.companion.binding={id:'b',peer:{id:'peer',displayName:'Bob'},createdAt:'2026-10-07T09:00:00Z'};
  response.companion.shareSettings.categories=['encouragement'];expect(canSendEncouragement(response)).toBe(false);
  response.companion.peerSnapshot={updatedAt:'2026-10-07T09:00:00Z',sharedCategories:['encouragement']};expect(canSendEncouragement(response)).toBe(true);
  response.companion.messages=[{id:'msg',text:'Keep going',createdAt:'2026-10-07T10:00:00Z',direction:'outgoing',status:'pending'}];
  const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);memory.handle('companion.sendEncouragement',()=>response);
  const queued=await invokeCompanionAction(bridge,{type:'sendEncouragement',text:'Keep going'});expect(queued.view.companion.messages[0]?.status).toBe('pending');
  expect(readCompanionView({...response,companion:{...response.companion,messages:[{...response.companion.messages[0],status:'delivered'}]}})).toBeNull();
});
test('unlink always purges peer cache, and account deletion forwards the user explicit local-data choice',async()=>{
  const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);const calls:unknown[]=[];
  memory.handle('companion.unlink',request=>{calls.push(request);return fixture();});
  memory.handle('companion.deleteAccount',request=>{calls.push(request);return fixture();});
  await invokeCompanionAction(bridge,{type:'unlink',deletePeerCache:true});
  await invokeCompanionAction(bridge,{type:'deleteAccount',password:'private-password',deleteLocalData:false},signedIn());
  await invokeCompanionAction(bridge,{type:'deleteAccount',password:'private-password',deleteLocalData:true},signedIn());
  expect(calls).toEqual([{deletePeerCache:true},{password:'private-password',deleteLocalData:false},{password:'private-password',deleteLocalData:true}]);
});
test('unsupported/malformed sync and offline failures stay failures and never fabricate peer data',async()=>{
  const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);
  memory.handle('companion.sync',()=>({...fixture(),hostData:{},personal:{}}));
  await expect(invokeCompanionAction(bridge,{type:'sync'})).rejects.toThrow('Invalid synchronized data');
  memory.handle('companion.login',()=>{throw {code:'unavailable',message:'Offline'};});
  await expect(invokeCompanionAction(bridge,{type:'login',login:'alice',password:'private-password'})).rejects.toMatchObject({code:'unavailable'});
  expect(readCompanionView({companion:{},runtime:{}})).toBeNull();
});
test('remote endpoints require TLS, local QA loopback is explicit, and credentials or fragments are rejected',()=>{
  expect(companionEndpointValid('https://relay.example.org')).toBe(true);expect(companionEndpointValid('http://10.0.2.2:8787')).toBe(true);
  expect(companionEndpointValid('http://relay.example.org')).toBe(false);expect(companionEndpointValid('https://user:pass@relay.example.org')).toBe(false);
  expect(companionEndpointValid('https://relay.example.org#secret')).toBe(false);
  expect(companionEndpointValid('https://relay.example.org/foo')).toBe(false);expect(companionEndpointValid('https://relay.example.org:0')).toBe(false);
  expect(companionEndpointValid('https://relay.example.org:99999')).toBe(false);expect(companionEndpointValid('https://relay.example.org:65535/')).toBe(true);
});
