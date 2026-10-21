import {accountDeletionActionAllowed} from './account-deletion.js';
import type {CompanionView} from './companion-ui.js';
import type { LeanOnBridgeClient } from '@zzzode/bridge';
import { isPersonalState, type PersonalStateDto } from '@zzzode/data';
import { readHostDataEnvelope } from './host-data.js';
import type { HostData } from './types.js';
import { readCompanionView } from './companion-ui.js';
import type { CompanionAction, CompanionActionResult } from './companion-actions.js';

export interface CompanionClientResult extends CompanionActionResult {hostData?:HostData;personal?:PersonalStateDto}
/** Every action uses its native typed method; this layer never fabricates binding or delivery. */
export async function invokeCompanionAction(bridge: LeanOnBridgeClient, action: CompanionAction,current?:CompanionView|null): Promise<CompanionClientResult> {
  if((current!==undefined||action.type==='deleteAccount')&&!accountDeletionActionAllowed(current??null,action))throw new Error('Account deletion recovery required');
  const response = await (async()=>{
    switch(action.type){
      case 'configure':return bridge.invoke('companion.configure',{endpoint:action.endpoint});
      case 'register':return bridge.invoke('companion.register',{login:action.login,password:action.password,...(action.admissionToken?{admissionToken:action.admissionToken}:{})});
      case 'login':return bridge.invoke('companion.login',{login:action.login,password:action.password});
      case 'attachLocalData':return bridge.invoke('companion.attachLocalData',{expectedRecordsRevision:action.expectedRecordsRevision,expectedPersonalRevision:action.expectedPersonalRevision});
      case 'logout':return bridge.invoke('companion.logout');
      case 'confirmAccountDeletionLocalData':return bridge.invoke('companion.confirmAccountDeletionLocalData',{deleteLocalData:action.deleteLocalData,expectedRecordsRevision:action.expectedRecordsRevision,expectedPersonalRevision:action.expectedPersonalRevision});
      case 'deleteAccount':return bridge.invoke('companion.deleteAccount',{password:action.password,deleteLocalData:action.deleteLocalData});
      case 'createInvitation':return bridge.invoke('companion.createInvitation',{kind:action.kind});
      case 'acceptInvitation':return bridge.invoke('companion.acceptInvitation',{code:action.code});
      case 'confirmInvitation':return bridge.invoke('companion.confirmInvitation',{id:action.id});
      case 'cancelInvitation':return bridge.invoke('companion.cancelInvitation',{id:action.id});
      case 'setSharing':return bridge.invoke('companion.setSharing',{categories:action.categories});
      case 'sync':return bridge.invoke('companion.sync');
      case 'sendEncouragement':return bridge.invoke('companion.sendEncouragement',{text:action.text});
      case 'unlink':return bridge.invoke('companion.unlink',{deletePeerCache:true});
    }
  })();
  const view=readCompanionView(response);
  if(view===null)throw new Error('Invalid companion response');
  if(action.type==='createInvitation'){
    if(!('invitationCode' in response)||typeof response.invitationCode!=='string'||response.invitationCode==='')throw new Error('Missing invitation code');
    return {view,invitationCode:response.invitationCode};
  }
  if(action.type==='sync'){
    const hostData=readHostDataEnvelope(response);
    if(hostData===null||!('personal' in response)||!isPersonalState(response.personal))throw new Error('Invalid synchronized data');
    return {view,hostData,personal:response.personal};
  }
  return {view};
}
