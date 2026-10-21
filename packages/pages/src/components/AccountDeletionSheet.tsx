import {useEffect,useRef,useState} from '@lynx-js/react';
import type {Translator} from '@zzzode/i18n';
import type {CompanionView} from '../state/companion-ui.js';
import type {CompanionAction,CompanionActionResult} from '../state/companion-actions.js';
import type {LocalAttachmentPreview} from '../state/local-attachment.js';
import {accountDeletionLocalAction,accountDeletionNewDataMustBeKept} from '../state/account-deletion.js';
import {WorkflowButton,WorkflowChoice,WorkflowField,WorkflowSheet} from './WorkflowSheet.js';

export function AccountDeletionSheet({view,t,onClose,onAction,onRefresh,onRefreshLocalData}:{view:CompanionView;t:Translator;onClose:()=>void;onAction:(action:CompanionAction)=>Promise<CompanionActionResult>;onRefresh:()=>Promise<void>;onRefreshLocalData:()=>Promise<LocalAttachmentPreview>}) {
  const deletion=view.runtime.accountDeletion;
  const mustKeepNewData=accountDeletionNewDataMustBeKept(view);
  const accountId=useRef(deletion?.accountId??'').current;
  const password=useRef('');const pending=useRef(false);const mounted=useRef(true);
  const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
  const [preview,setPreview]=useState<LocalAttachmentPreview|undefined>(undefined);
  const [deleteLocal,setDeleteLocal]=useState(false);const [consent,setConsent]=useState(false);
  const consentFor=useRef(mustKeepNewData);
  const currentConsent=consent&&consentFor.current===mustKeepNewData;
  const currentDeleteLocal=deleteLocal&&!mustKeepNewData;
  useEffect(()=>{setConsent(false);consentFor.current=mustKeepNewData;if(mustKeepNewData){setDeleteLocal(false);setPreview(undefined);}},[mustKeepNewData]);
  useEffect(()=>()=>{mounted.current=false;},[]);
  const refreshLocal=async()=>{
    if(pending.current)return;pending.current=true;setBusy(true);setConsent(false);setPreview(undefined);setError(null);
    try{const next=await onRefreshLocalData();if(mounted.current)setPreview(next);}catch{if(mounted.current)setError(t('personal.loadError'));}
    finally{pending.current=false;if(mounted.current)setBusy(false);}
  };
  useEffect(()=>{if(deletion?.phase!=='prepared')password.current='';},[deletion?.phase]);
  useEffect(()=>{if(deletion?.phase==='confirmed'&&deletion.localDataChanged)void refreshLocal();},[deletion?.phase,deletion?.localDataChanged]);
  const retryStatus=async()=>{
    if(pending.current)return;pending.current=true;setBusy(true);setError(null);
    try{await onRefresh();}catch{if(mounted.current)setError(t('companion.error'));}
    finally{pending.current=false;if(mounted.current)setBusy(false);}
  };
  const save=async()=>{
    if(pending.current||deletion===null||deletion.accountId!==accountId)return;
    let action:CompanionAction|null=null;
    if(deletion.phase==='prepared'){
      if(password.current.length<12||password.current.length>256){setError(t('companion.invalid'));return;}
      action={type:'deleteAccount',password:password.current,deleteLocalData:deletion.deleteLocalData};
    }else action=accountDeletionLocalAction(view,accountId,preview,currentDeleteLocal,currentConsent);
    if(action===null){setError(t('companion.invalid'));return;}
    pending.current=true;setBusy(true);setError(null);
    try{await onAction(action);}catch{if(mounted.current)setError(t('companion.error'));}
    finally{pending.current=false;if(mounted.current)setBusy(false);}
  };
  const needsChoice=deletion?.phase==='confirmed'&&deletion.localDataChanged;
  return <WorkflowSheet t={t} title={t('companion.deletionRecovery')} busy={busy} feedback={error} onClose={onClose}
    onSave={deletion?.phase==='prepared'||needsChoice?()=>void save():undefined}
    saveLabel={t(deletion?.phase==='prepared'?'companion.retryDeletion':'companion.confirmLocalDeletion')}
    saveDisabled={needsChoice&&accountDeletionLocalAction(view,accountId,preview,currentDeleteLocal,currentConsent)===null}>
    {deletion===null?<text className="Section-note">{t('companion.deletionFinished')}</text>:<view>
      <text className="Section-heading">{deletion.displayName}</text><text className="Section-note">{deletion.accountId}</text>
      <text className="Section-note">{t(deletion.phase==='prepared'?'companion.deletionPrepared':deletion.phase==='local-complete'?'companion.deletionLocalComplete':mustKeepNewData?'companion.deletionNewDataKept':deletion.localDataChanged?'companion.deletionDataChanged':'companion.deletionConfirmed')}</text>
      {deletion.phase==='prepared'&&<view>
        <text className="List-label">{t(deletion.deleteLocalData?'companion.deleteLocal':'companion.keepLocal')}</text>
        <text className="Section-note">{t('companion.deletionCloseNote')}</text>
        <WorkflowField id="companion-retry-delete-password" label={t('companion.password')} type="password" disabled={busy} onChange={value=>{password.current=value;setError(null);}}/>
      </view>}
      {needsChoice&&<view>
        <text className="Section-heading">{t('companion.currentLocalData')}</text>
        {preview===undefined?<text className="Section-note">{t(busy?'closure.loading':'personal.loadError')}</text>:<view>
          <text className="List-label">{t('daily.weight')} : {preview.counts.weights}</text><text className="List-label">{t('daily.water')} : {preview.counts.water}</text><text className="List-label">{t('daily.exercise')} : {preview.counts.exercises}</text><text className="List-label">{t('daily.meals')} : {preview.counts.meals}</text><text className="List-label">{t('daily.legacyTotal')} : {preview.counts.legacy}</text><text className="List-label">{t('personal.measurements')} : {preview.counts.measurements}</text><text className="List-label">{t('personal.photos')} : {preview.counts.photos}</text>
        </view>}
        <WorkflowButton t={t} label={t('companion.refreshLocalData')} disabled={busy} onTap={()=>void refreshLocal()}/>
        <WorkflowChoice t={t} label={t('companion.keepLocal')} selected={!currentDeleteLocal} disabled={busy||preview===undefined} onTap={()=>{setDeleteLocal(false);setConsent(false);}}/>
        <WorkflowChoice t={t} label={t('companion.deleteLocal')} selected={currentDeleteLocal} disabled={busy||preview===undefined||mustKeepNewData} onTap={()=>{setDeleteLocal(true);setConsent(false);}}/>
        {mustKeepNewData&&<text className="Section-note">{t('companion.deletionNoSecondWipe')}</text>}
        <WorkflowChoice t={t} label={t('companion.deletionLocalConsent')} selected={currentConsent} disabled={busy||preview===undefined} onTap={()=>setConsent(value=>!value)}/>
      </view>}
    </view>}
    <WorkflowButton t={t} label={t('companion.checkDeletionStatus')} disabled={busy} onTap={()=>void retryStatus()}/>
  </WorkflowSheet>;
}
