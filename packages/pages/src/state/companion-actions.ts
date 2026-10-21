import type { ShareCategory } from '@zzzode/data';
import type { CompanionView } from './companion-ui.js';

export type CompanionAction =
  | {type:'configure';endpoint:string}
  | {type:'register'|'login';login:string;password:string;admissionToken?:string}
  | {type:'logout'|'sync'}
  | {type:'attachLocalData';expectedRecordsRevision:number;expectedPersonalRevision:number}
  | {type:'deleteAccount';password:string;deleteLocalData:boolean}
  | {type:'confirmAccountDeletionLocalData';deleteLocalData:boolean;expectedRecordsRevision:number;expectedPersonalRevision:number}
  | {type:'createInvitation';kind:'family'|'device'}
  | {type:'acceptInvitation';code:string}
  | {type:'confirmInvitation'|'cancelInvitation';id:string}
  | {type:'setSharing';categories:ShareCategory[]}
  | {type:'sendEncouragement';text:string}
  | {type:'unlink';deletePeerCache:true};
export interface CompanionActionResult {view:CompanionView;invitationCode?:string}
export type CompanionWorkflow = 'server'|'login'|'register'|'accept'|'family-invite'|'device-invite'|'sharing'|'message'|'confirm-invite'|'unlink'|'delete'|'logout'|'attach'|'deletion-recovery';
