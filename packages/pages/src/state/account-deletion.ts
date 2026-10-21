import type {CompanionAction} from './companion-actions.js';
import type {CompanionView} from './companion-ui.js';
import type {LocalAttachmentPreview} from './local-attachment.js';

/** This public status means the original wipe already completed; newly created data are never wiped again. */
export function accountDeletionNewDataMustBeKept(view:CompanionView|null):boolean {
  return view?.runtime.errorCode==='account-deletion-key-cleanup-conflict';
}

/** Durable deletion locks account actions even when the session/account has already been cleared. */
export function accountDeletionActionAllowed(view:CompanionView|null,action:CompanionAction):boolean {
  const deletion=view?.runtime.accountDeletion;
  if(deletion===undefined||deletion===null)return action.type!=='confirmAccountDeletionLocalData'&&(action.type!=='deleteAccount'||view?.runtime.deviceAuthorized===true);
  return deletion.phase==='prepared'
    ?action.type==='deleteAccount'&&action.deleteLocalData===deletion.deleteLocalData
    :deletion.phase==='confirmed'&&deletion.localDataChanged&&action.type==='confirmAccountDeletionLocalData'&&(!action.deleteLocalData||!accountDeletionNewDataMustBeKept(view));
}
export function accountDeletionLocalAction(view:CompanionView,accountId:string,preview:LocalAttachmentPreview|undefined,deleteLocalData:boolean,consent:boolean):Extract<CompanionAction,{type:'confirmAccountDeletionLocalData'}>|null {
  const deletion=view.runtime.accountDeletion;
  if(deletion===null||deletion.phase!=='confirmed'||!deletion.localDataChanged||deletion.accountId!==accountId||preview===undefined||!consent||(deleteLocalData&&accountDeletionNewDataMustBeKept(view)))return null;
  return {type:'confirmAccountDeletionLocalData',deleteLocalData,expectedRecordsRevision:preview.expectedRecordsRevision,expectedPersonalRevision:preview.expectedPersonalRevision};
}
