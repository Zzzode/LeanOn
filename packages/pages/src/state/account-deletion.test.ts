import {expect,test} from '@rstest/core';
import {createLeanOnBridgeClient,createMemoryBridge} from '@zzzode/bridge';
import {createSignedOutCompanionState,type CompanionAccountDeletionDto,type CompanionResponseDto} from '@zzzode/data';
import {accountDeletionActionAllowed,accountDeletionLocalAction} from './account-deletion.js';
import {invokeCompanionAction} from './companion-client.js';
import {readCompanionView} from './companion-ui.js';
import type {CompanionAction} from './companion-actions.js';
function view(phase:CompanionAccountDeletionDto['phase'],changed=false):CompanionResponseDto {
  return {companion:createSignedOutCompanionState(),runtime:{endpoint:'http://localhost:8787',deviceAuthorized:false,localDataAccountId:null,syncState:'error',pendingChanges:0,lastSyncAt:null,nativeNow:'2026-10-07T10:00:00Z',errorCode:'deletion-pending',accountDeletion:{phase,accountId:'old-account',displayName:'Alice',deleteLocalData:true,localDataChanged:changed}}};
}
const normalActions:CompanionAction[]=[{type:'login',login:'bob',password:'private-password'},{type:'register',login:'bob',password:'private-password'},{type:'configure',endpoint:'https://relay.example.org'},{type:'logout'},{type:'sync'},{type:'attachLocalData',expectedRecordsRevision:1,expectedPersonalRevision:2},{type:'createInvitation',kind:'device'},{type:'acceptInvitation',code:'secret'},{type:'confirmInvitation',id:'invite'},{type:'setSharing',categories:['photos']},{type:'sendEncouragement',text:'Hello'},{type:'unlink',deletePeerCache:true}];
test('all deletion phases block account actions even after account/session disappear; prepared retry preserves original choice',async()=>{
  const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);let calls=0;
  memory.handle('companion.login',()=>{calls++;return view('prepared');});
  for(const phase of ['prepared','confirmed','local-complete'] as const){
    const current=view(phase,true);expect(current.companion.account).toBeNull();expect(readCompanionView(current)).not.toBeNull();
    for(const action of normalActions)expect(accountDeletionActionAllowed(current,action)).toBe(false);
    await expect(invokeCompanionAction(bridge,normalActions[0]!,current)).rejects.toThrow('Account deletion recovery required');
  }
  expect(calls).toBe(0);
  expect(accountDeletionActionAllowed(view('prepared'),{type:'deleteAccount',password:'private-password',deleteLocalData:false})).toBe(false);
  expect(accountDeletionActionAllowed(view('prepared'),{type:'deleteAccount',password:'private-password',deleteLocalData:true})).toBe(true);
});
test('confirmed changed data require named recovery, explicit consent and exact refreshed dual CAS; keep-local is supported',async()=>{
  const current=view('confirmed',true);const preview={expectedRecordsRevision:19,expectedPersonalRevision:8,counts:{weights:2,water:1,exercises:3,meals:4,legacy:0,measurements:1,photos:5}};
  expect(accountDeletionLocalAction(current,'old-account',preview,true,false)).toBeNull();
  expect(accountDeletionLocalAction(current,'different-account',preview,true,true)).toBeNull();
  expect(accountDeletionLocalAction(current,'old-account',undefined,false,true)).toBeNull();
  expect(accountDeletionLocalAction(view('confirmed',false),'old-account',preview,true,true)).toBeNull();
  const action=accountDeletionLocalAction(current,'old-account',preview,false,true)!;
  const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);let sent:unknown;
  memory.handle('companion.confirmAccountDeletionLocalData',request=>{sent=request;return view('local-complete');});
  const result=await invokeCompanionAction(bridge,action,current);
  expect(sent).toEqual({deleteLocalData:false,expectedRecordsRevision:19,expectedPersonalRevision:8});
  expect(result.view.runtime.accountDeletion?.phase).toBe('local-complete');
  expect(accountDeletionLocalAction(view('local-complete'),'old-account',preview,true,true)).toBeNull();
});
test('stale local confirmation stays conflict without rebasing or clearing recovery; status retry needs no password',async()=>{
  const current=view('confirmed',true);const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);let writes=0;
  memory.handle('companion.confirmAccountDeletionLocalData',()=>{writes++;throw {code:'conflict',message:'Local data changed'};});
  memory.handle('companion.getState',()=>current);
  const action:CompanionAction={type:'confirmAccountDeletionLocalData',deleteLocalData:true,expectedRecordsRevision:19,expectedPersonalRevision:8};
  await expect(invokeCompanionAction(bridge,action,current)).rejects.toMatchObject({code:'conflict'});
  const refreshed=readCompanionView(await bridge.invoke('companion.getState'));
  expect(refreshed?.runtime.accountDeletion?.phase).toBe('confirmed');expect(writes).toBe(1);
  expect(action).toMatchObject({expectedRecordsRevision:19,expectedPersonalRevision:8});
});
test('recovery runtime remains credential-free and strict; injected proof or malformed flags fail closed',()=>{
  const current=view('prepared');const deletion=current.runtime.accountDeletion!;
  expect(readCompanionView({...current,runtime:{...current.runtime,accountDeletion:{...deletion,proof:'secret'}}})).toBeNull();
  expect(readCompanionView({...current,runtime:{...current.runtime,accountDeletion:{...deletion,localDataChanged:'true'}}})).toBeNull();
});
test('after durable wipe, recreated local data can only be explicitly kept; generic pre-wipe conflicts retain both choices',async()=>{
  const before=view('confirmed',true);const after={...before,runtime:{...before.runtime,errorCode:'account-deletion-key-cleanup-conflict'}};
  const preview={expectedRecordsRevision:23,expectedPersonalRevision:12,counts:{weights:1,water:0,exercises:0,meals:0,legacy:0,measurements:0,photos:0}};
  expect(accountDeletionLocalAction(before,'old-account',preview,true,true)).not.toBeNull();
  expect(accountDeletionLocalAction(after,'old-account',preview,true,true)).toBeNull();
  const keep=accountDeletionLocalAction(after,'old-account',preview,false,true)!;
  expect(keep).toEqual({type:'confirmAccountDeletionLocalData',deleteLocalData:false,expectedRecordsRevision:23,expectedPersonalRevision:12});
  const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);let writes=0;
  memory.handle('companion.confirmAccountDeletionLocalData',()=>{writes++;return after;});
  await expect(invokeCompanionAction(bridge,{...keep,deleteLocalData:true},after)).rejects.toThrow('Account deletion recovery required');
  expect(writes).toBe(0);await invokeCompanionAction(bridge,keep,after);expect(writes).toBe(1);
  expect(accountDeletionLocalAction(after,'old-account',preview,false,false)).toBeNull();
});
test('an unauthorized fresh device cannot dispatch initial deletion, while a durable prepared retry still uses saved device identity',async()=>{
  const pending=view('prepared');const fresh={...pending,runtime:{...pending.runtime,accountDeletion:null}};
  const action:CompanionAction={type:'deleteAccount',password:'private-password',deleteLocalData:true};
  const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);let calls=0;
  memory.handle('companion.deleteAccount',()=>{calls++;return pending;});
  await expect(invokeCompanionAction(bridge,action,fresh)).rejects.toThrow('Account deletion recovery required');
  await expect(invokeCompanionAction(bridge,action)).rejects.toThrow('Account deletion recovery required');
  expect(calls).toBe(0);expect(fresh.runtime.deviceAuthorized).toBe(false);
  await invokeCompanionAction(bridge,action,pending);expect(calls).toBe(1);
  expect(pending.runtime.deviceAuthorized).toBe(false);
});
