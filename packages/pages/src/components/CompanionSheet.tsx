import { useRef, useState } from '@lynx-js/react';
import { attachmentAction,type LocalAttachmentPreview } from '../state/local-attachment.js';
import type { ShareCategory } from '@zzzode/data';
import type { MessageKey, Translator } from '@zzzode/i18n';
import { canConfirmInvitation, companionEndpointValid, SHARE_CATEGORIES, type CompanionView } from '../state/companion-ui.js';
import type { CompanionAction, CompanionActionResult, CompanionWorkflow } from '../state/companion-actions.js';
import { WorkflowButton, WorkflowChoice, WorkflowField, WorkflowSheet } from './WorkflowSheet.js';

const TITLE:Record<CompanionWorkflow,MessageKey>={server:'companion.server',login:'companion.signIn',register:'companion.register',accept:'companion.accept','family-invite':'companion.invite','device-invite':'companion.pairDevice',sharing:'companion.sharing',message:'companion.encourage','confirm-invite':'companion.confirmInvite',unlink:'companion.unlink',delete:'companion.deleteAccount',logout:'companion.signOut',attach:'companion.attach','deletion-recovery':'companion.deletionRecovery'};

/** Secrets are ephemeral UI drafts; only an explicit action invokes the native account operation. */
export function CompanionSheet({workflow,view,invitationId,localDataPreview,t,onClose,onAction,onRefreshLocalData}:{workflow:CompanionWorkflow;view:CompanionView;invitationId?:string;localDataPreview?:LocalAttachmentPreview;t:Translator;onClose:()=>void;onAction:(action:CompanionAction)=>Promise<CompanionActionResult>;onRefreshLocalData:()=>Promise<LocalAttachmentPreview>}) {
  const [localData,setLocalData]=useState(localDataPreview);const namedAccount=useRef(view.companion.account).current;
  const [endpoint,setEndpoint]=useState(view.runtime.endpoint??'');const login=useRef('');const password=useRef('');const admissionToken=useRef('');const code=useRef('');const message=useRef('');
  const [categories,setCategories]=useState<ShareCategory[]>(view.companion.shareSettings.categories);
  const [consent,setConsent]=useState(false);const [deleteLocal,setDeleteLocal]=useState(false);
  const [createdCode,setCreatedCode]=useState<string|null>(null);const [showCode,setShowCode]=useState(false);
  const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const pending=useRef(false);
  const invitation=view.companion.invitations.find(value=>value.id===invitationId);
  const act=async(action:CompanionAction,keepOpen=false)=>{
    if(pending.current)return;pending.current=true;setBusy(true);setError(null);
    try{
      const result=await onAction(action);
      if(action.type==='createInvitation'){
        if(result.invitationCode===undefined||result.invitationCode==='')throw new Error('Missing invitation code');
        setCreatedCode(result.invitationCode);setShowCode(false);
      }else if(!keepOpen)onClose();
    }catch(error){
      const code=typeof error==='object'&&error!==null&&'code' in error?error.code:undefined;
      setError(t(code==='method-not-found'?'review.hostUnsupported':code==='not-authorized'&&(workflow==='login'||workflow==='register')?'companion.authError':'companion.error'));
    }finally{pending.current=false;setBusy(false);}
  };
  const refreshLocal=async()=>{if(pending.current)return;pending.current=true;setBusy(true);setError(null);setConsent(false);try{setLocalData(await onRefreshLocalData());}catch{setError(t('personal.loadError'));}finally{pending.current=false;setBusy(false);}};
  const save=()=>{
    if(workflow==='server'){
      if(!companionEndpointValid(endpoint)){setError(t('companion.invalid'));return;}void act({type:'configure',endpoint:endpoint.trim()});
    }else if(workflow==='login'||workflow==='register'){
      if(login.current.trim()===''||login.current.length>100||password.current.length<12||password.current.length>256){setError(t('companion.invalid'));return;}
      const admission=admissionToken.current.trim();if(workflow==='register'&&admission!==''&&!/^[A-Za-z0-9_-]{43}$/.test(admission)){setError(t('companion.invalid'));return;}
      void act({type:workflow,login:login.current.trim(),password:password.current,...(workflow==='register'&&admission?{admissionToken:admission}:{})});
    }else if(workflow==='attach'){
      const action=attachmentAction(localData,namedAccount?.id??null,view,consent);if(action===null){setError(t('companion.invalid'));return;}void act(action);
    }else if(workflow==='accept'){
      if(code.current.trim()===''){setError(t('companion.invitationInvalid'));return;}void act({type:'acceptInvitation',code:code.current.trim()});
    }else if(workflow==='sharing')void act({type:'setSharing',categories});
    else if(workflow==='message'){
      const text=message.current.trim();if(text.length<1||text.length>1000){setError(t('companion.messageInvalid'));return;}void act({type:'sendEncouragement',text});
    }else if(workflow==='unlink'&&consent)void act({type:'unlink',deletePeerCache:true});
    else if(workflow==='delete'&&consent){if(password.current.length<12||password.current.length>256){setError(t('companion.invalid'));return;}void act({type:'deleteAccount',password:password.current,deleteLocalData:deleteLocal});}
    else if(workflow==='logout'&&consent)void act({type:'logout'});
    else if(workflow==='confirm-invite'&&invitation!==undefined&&consent&&canConfirmInvitation(invitation,view.runtime.nativeNow))void act({type:'confirmInvitation',id:invitation.id});
  };
  const needsConsent=['unlink','delete','logout','confirm-invite','attach'].includes(workflow);
  const hasSave=workflow!=='family-invite'&&workflow!=='device-invite';
  const saveKey:MessageKey=workflow==='message'?'companion.send':workflow==='unlink'?'companion.unlinkConfirm':workflow==='delete'?'companion.confirmDelete':workflow==='sharing'?'companion.saveSharing':TITLE[workflow];
  const saveDisabled=(workflow==='attach'&&attachmentAction(localData,namedAccount?.id??null,view,true)===null)||(needsConsent&&!consent)||(workflow==='confirm-invite'&&(invitation===undefined||!canConfirmInvitation(invitation,view.runtime.nativeNow)));
  return <WorkflowSheet t={t} title={t(TITLE[workflow])} busy={busy} feedback={error} onClose={onClose} onSave={hasSave?save:undefined} saveLabel={t(saveKey)} saveDisabled={saveDisabled}>
    {workflow==='server'&&<view><text className="Section-note">{t('companion.localNote')}</text><WorkflowField id="companion-endpoint" label={t('companion.endpoint')} initialValue={view.runtime.endpoint??''} hint={t('companion.endpointHint')} disabled={busy} onChange={value=>{setEndpoint(value);setError(null);}}/></view>}
    {(workflow==='login'||workflow==='register')&&<view>
      <text className="Section-note">{view.runtime.endpoint}</text>
      <WorkflowField id="companion-login" label={t('companion.login')} disabled={busy} onChange={value=>{login.current=value;setError(null);}}/>
      <WorkflowField id="companion-password" label={t('companion.password')} type="password" hint={t('companion.passwordHint')} disabled={busy} onChange={value=>{password.current=value;setError(null);}}/>
      {workflow==='register'&&<WorkflowField id="companion-admission" label={t('companion.admission')} type="password" hint={t('companion.admissionHint')} disabled={busy} onChange={value=>{admissionToken.current=value;setError(null);}}/>}
    </view>}
    {workflow==='attach'&&<view><text className="Section-note">{t('companion.attachNote')}</text><text className="Section-heading">{namedAccount?.displayName}</text><text className="Section-note">{namedAccount?.id}</text>
      {localData!==undefined&&<view><text className="List-label">{t('daily.weight')} : {localData.counts.weights}</text><text className="List-label">{t('daily.water')} : {localData.counts.water}</text><text className="List-label">{t('daily.exercise')} : {localData.counts.exercises}</text><text className="List-label">{t('daily.meals')} : {localData.counts.meals}</text><text className="List-label">{t('daily.legacyTotal')} : {localData.counts.legacy}</text><text className="List-label">{t('personal.measurements')} : {localData.counts.measurements}</text><text className="List-label">{t('personal.photos')} : {localData.counts.photos}</text></view>}
      {localData===undefined&&<text className="Section-note">{t('personal.loadError')}</text>}<WorkflowButton t={t} label={t('closure.retry')} disabled={busy} onTap={()=>void refreshLocal()}/>
      <WorkflowChoice t={t} label={t('companion.attachConsent')} selected={consent} disabled={busy||localData===undefined} onTap={()=>setConsent(value=>!value)}/>
    </view>}
    {workflow==='accept'&&<view><text className="Section-note">{t('companion.pendingNote')}</text><WorkflowField id="companion-invitation" label={t('companion.code')} disabled={busy} onChange={value=>{code.current=value;setError(null);}}/></view>}
    {(workflow==='family-invite'||workflow==='device-invite')&&<view>
      <text className="Section-note">{t(workflow==='device-invite'?'companion.deviceNote':'companion.inviteNote')}</text>
      {createdCode===null?<WorkflowButton t={t} label={t(TITLE[workflow])} primary disabled={busy} onTap={()=>void act({type:'createInvitation',kind:workflow==='device-invite'?'device':'family'},true)}/>:<view>
        <text className="Section-note">{t('companion.codeOnce')}</text>
        <WorkflowButton t={t} label={t('companion.showCode')} disabled={busy} onTap={()=>setShowCode(true)}/>
        {showCode&&<text className="Workflow-code" text-selection={true}>{createdCode}</text>}
      </view>}
    </view>}
    {workflow==='sharing'&&<view><text className="Section-note">{t('companion.privateDefault')}</text>
      {SHARE_CATEGORIES.map(category=><WorkflowChoice t={t} key={category} label={t(`companion.category.${category}`)} selected={categories.includes(category)} disabled={busy} onTap={()=>{setCategories(values=>values.includes(category)?values.filter(value=>value!==category):[...values,category]);setError(null);}}/>)}
    </view>}
    {workflow==='message'&&<view><text className="Section-note">{t('companion.ackNote')}</text><WorkflowField id="companion-message" label={t('companion.message')} disabled={busy} onChange={value=>{message.current=value;setError(null);}}/></view>}
    {workflow==='confirm-invite'&&invitation!==undefined&&<view>
      <text className="Section-note">{t('companion.confirmInviteNote')}</text>
      <text className="List-label">{t('companion.partnerId')} · {invitation.recipientId??'—'}</text>
      <text className="List-label">{t('companion.deviceId')} · {invitation.recipientDeviceId??'—'}</text>
      <text className="Section-note">{t('companion.expires',{time:invitation.expiresAt})}</text>
      {!canConfirmInvitation(invitation,view.runtime.nativeNow)&&<text className="Section-note">{t('companion.pendingNote')}</text>}
      <WorkflowChoice t={t} label={t('companion.confirmDestructive')} selected={consent} disabled={busy} onTap={()=>setConsent(value=>!value)}/>
      <WorkflowButton t={t} label={t('companion.cancelInvite')} danger disabled={busy} onTap={()=>void act({type:'cancelInvitation',id:invitation.id})}/>
    </view>}
    {(workflow==='unlink'||workflow==='delete'||workflow==='logout')&&<view>
      <text className="Section-note">{t(workflow==='unlink'?'companion.unlinkNote':workflow==='delete'?'companion.deleteNote':'companion.signOutNote')}</text>
      {workflow==='delete'&&<view>
        <WorkflowChoice t={t} label={t('companion.keepLocal')} selected={!deleteLocal} disabled={busy} onTap={()=>setDeleteLocal(false)}/>
        <WorkflowChoice t={t} label={t('companion.deleteLocal')} selected={deleteLocal} disabled={busy} onTap={()=>setDeleteLocal(true)}/>
        <WorkflowField id="companion-delete-password" label={t('companion.password')} type="password" disabled={busy} onChange={value=>{password.current=value;setError(null);}}/>
      </view>}
      <WorkflowChoice t={t} label={t('companion.confirmDestructive')} selected={consent} disabled={busy} onTap={()=>setConsent(value=>!value)}/>
    </view>}
  </WorkflowSheet>;
}
