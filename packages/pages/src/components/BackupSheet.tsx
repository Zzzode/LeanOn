import { useRef, useState } from '@lynx-js/react';
import type { Translator } from '@zzzode/i18n';
import { backupPasswordValid, type BackupInspection } from '../state/backup-ui.js';
import { WorkflowButton, WorkflowChoice, WorkflowField, WorkflowSheet } from './WorkflowSheet.js';

export function BackupSheet({t,onClose,onExport,onInspect,onRestore}:{t:Translator;onClose:()=>void;onExport:(password:string)=>Promise<boolean>;onInspect:(password:string)=>Promise<BackupInspection|null>;onRestore:(preview:BackupInspection)=>Promise<void>}) {
  const password=useRef('');const [preview,setPreview]=useState<BackupInspection|null>(null);const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const [status,setStatus]=useState<string|null>(null);const pending=useRef(false);
  const perform=async(action:'export'|'inspect'|'restore')=>{
    if(pending.current)return;
    if(action!=='restore'&&!backupPasswordValid(password.current)){setError(t('backup.invalidPassword'));return;}
    if(action==='restore'&&(preview===null||!consent))return;
    pending.current=true;setBusy(true);setError(null);setStatus(null);
    try{
      if(action==='export'){if(await onExport(password.current))setStatus(t('backup.exported'));}
      if(action==='inspect'){const next=await onInspect(password.current);if(next!==null){setPreview(next);setConsent(false);}}
      if(action==='restore'&&preview!==null){await onRestore(preview);password.current='';setPreview(null);setConsent(false);setStatus(t('backup.restored'));}
    }catch(error){
      const code=typeof error==='object'&&error!==null&&'code' in error?error.code:undefined;
      if(code!=='cancelled')setError(t(code==='conflict'?'backup.expired':'backup.error'));
    }finally{pending.current=false;setBusy(false);}
  };
  return <WorkflowSheet t={t} title={t(preview===null?'backup.title':'backup.preview')} busy={busy} feedback={error??status} onClose={onClose}
    onSave={preview===null?undefined:()=>void perform('restore')} saveLabel={t('backup.confirm')} saveDisabled={!consent}>
    <text className="Section-note">{t('backup.note')}</text>
    {preview===null?<view>
      <WorkflowField id="backup-password" label={t('backup.password')} type="password" hint={t('backup.passwordHint')} disabled={busy} onChange={value=>{password.current=value;setError(null);setStatus(null);}}/>
      <view className="Workflow-actions"><WorkflowButton t={t} label={t('backup.export')} disabled={busy} onTap={()=>void perform('export')}/><WorkflowButton t={t} label={t('backup.inspect')} disabled={busy} onTap={()=>void perform('inspect')}/></view>
    </view>:<view>
      <text className="List-label">{preview.summary.createdAt}</text><text className="Section-note">{t(preview.summary.hasProfile?'backup.hasProfile':'backup.noProfile')} · {t(preview.summary.includesPhotos?'backup.includesPhotos':'backup.noPhotoFiles')}</text>
      <text className="Section-note">{t('backup.replaceNote')}</text>
      <text className="List-label">{t('daily.weight')} · {preview.summary.counts.weights}</text>
      <text className="List-label">{t('daily.water')} · {preview.summary.counts.water}</text>
      <text className="List-label">{t('daily.exercise')} · {preview.summary.counts.exercises}</text>
      <text className="List-label">{t('daily.meals')} · {preview.summary.counts.intakeEntries}</text>
      <text className="List-label">{t('daily.legacyTotal')} · {preview.summary.counts.legacyIntake}</text>
      <text className="List-label">{t('backup.foods')} · {preview.summary.counts.customFoods}</text>
      <text className="List-label">{t('backup.measurements')} · {preview.summary.counts.measurements}</text>
      <text className="List-label">{t('backup.photos')} · {preview.summary.counts.photos}</text>
      <text className="Section-note">{t('backup.preferences')}</text>
      <WorkflowChoice t={t} label={t('backup.confirmLabel')} selected={consent} disabled={busy} onTap={()=>setConsent(value=>!value)}/>
      <WorkflowButton t={t} label={t('daily.cancel')} disabled={busy} onTap={()=>{password.current='';setPreview(null);setConsent(false);setError(null);}}/>
    </view>}
  </WorkflowSheet>;
}
