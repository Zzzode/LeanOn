import { useEffect, useRef, useState } from '@lynx-js/react';
import type { CompanionMigrationState, LeanOnBridgeClient } from '@zzzode/bridge';
import type { Translator } from '@zzzode/i18n';
import { companionEndpointValid } from '../state/companion-ui.js';
import { MIGRATION_COUNT_FIELDS, migrationConfirmed, migrationRunning, readMigrationState } from '../state/migration-ui.js';
import { WorkflowButton, WorkflowChoice, WorkflowField, WorkflowSheet } from './WorkflowSheet.js';

/** Settings owns review consent; only native authority can report progress, activation or rollback. */
export function MigrationSheet({ bridge, t, onClose }: { bridge: LeanOnBridgeClient; t: Translator; onClose: () => void }) {
  const [view,setView] = useState<CompanionMigrationState|null>(null);
  const [endpoint,setEndpoint] = useState(''); const password = useRef(''); const backupPassword = useRef('');
  const [consent,setConsent] = useState(false); const [busy,setBusy] = useState(false); const [error,setError] = useState<string|null>(null);
  const [draftVersion,setDraftVersion] = useState(0); const pending = useRef(false); const polling = useRef(false);
  const apply = (value: unknown) => { const next = readMigrationState(value); if(next===null)throw new Error('Invalid migration state');setView(next);return next; };
  const refresh = async () => { if(polling.current)return;polling.current=true;try{apply(await bridge.invoke('companion.getMigrationState'));}catch{setError(t('migration.loadError'));}finally{polling.current=false;} };
  useEffect(()=>{
    let alive=true;
    void bridge.invoke('companion.getMigrationState').then(response=>{if(alive){const next=apply(response);setEndpoint(next.targetEndpoint??'');}}).catch(()=>{if(alive)setError(t('migration.loadError'));});
    const stop=bridge.subscribe('companion.migrationChanged',response=>{if(alive){const next=readMigrationState(response);if(next!==null)setView(next);}});
    return()=>{alive=false;stop();password.current='';backupPassword.current='';};
  },[bridge]);
  useEffect(()=>{if(!busy && (view===null || !migrationRunning(view.phase)))return;const timer=setInterval(()=>void refresh(),1500);return()=>clearInterval(timer);},[busy,view?.phase,bridge]);
  const run = async (operation:()=>Promise<unknown>) => {
    if(pending.current)return;pending.current=true;setBusy(true);setError(null);
    try{apply(await operation());setConsent(false);}catch(caught){
      const code=typeof caught==='object' && caught!==null && 'code' in caught?caught.code:undefined;
      setError(t(code==='conflict'?'migration.changed':code==='not-authorized'?'migration.identityError':code==='capacity'?'migration.capacity':'migration.error'));
      try{apply(await bridge.invoke('companion.getMigrationState'));}catch{/* Preserve the last confirmed native projection. */}
    }finally{password.current='';backupPassword.current='';setDraftVersion(v=>v+1);pending.current=false;setBusy(false);}
  };
  const pause = async () => {setError(null);try{apply(await bridge.invoke('companion.pauseMigration'));setConsent(false);}catch{setError(t('migration.error'));}};
  const phase=view?.phase; const working=busy || (phase!==undefined && migrationRunning(phase));
  const draft=phase==='idle' || phase==='rolled-back'; const review=phase==='review'; const resumable=phase==='paused' || phase==='prepared';
  const save = () => {
    if(view===null)return;
    if(draft){if(!companionEndpointValid(endpoint)||password.current.length<12){setError(t('migration.invalid'));return;}const secret=password.current;void run(()=>bridge.invoke('companion.previewMigration',{targetEndpoint:endpoint.trim().replace(/\/$/,''),password:secret}));}
    else if(review || resumable){if(!migrationConfirmed(view,consent,password.current,backupPassword.current)){setError(t('migration.invalid'));return;}const secret=password.current,backup=backupPassword.current;
      if(review && view.previewToken!==null)void run(()=>bridge.invoke('companion.startMigration',{previewToken:view.previewToken!,password:secret,backupPassword:backup,consent:true}));
      else void run(()=>bridge.invoke('companion.resumeMigration',{password:secret,backupPassword:backup,consent:true}));
    }else if(phase==='active' && consent)void run(()=>bridge.invoke('companion.rollbackMigration',{consent:true}));
  };
  const canSave=view!==null && !working && (draft?view.accountId!==null:phase==='active'?consent:review || resumable?consent:false);
  return <WorkflowSheet t={t} title={t('migration.title')} onClose={onClose} busy={working} feedback={error}
    onSave={draft || review || resumable || phase==='active'?save:undefined} saveLabel={t(draft?'migration.review':phase==='active'?'migration.rollback':review?'migration.start':'migration.resume')} saveDisabled={!canSave}>
    <text className="Section-note">{t('migration.intro')}</text>
    {view===null?<WorkflowButton t={t} label={t('closure.retry')} onTap={()=>void refresh()}/>:<view>
      <text className="Section-heading" accessibility-element={true} accessibility-label={t(`migration.phase.${view.phase}`)}>{t(`migration.phase.${view.phase}`)}</text>
      <text className="List-label">{t('migration.account')} · {view.accountName??'—'}</text>
      <text className="Section-note" text-selection={true}>{view.accountId??''}</text>
      <text className="List-label">{t('migration.source')}</text><text className="Section-note" text-selection={true}>{view.sourceEndpoint??'—'}</text>
      {draft?<WorkflowField id="migration-target" label={t('migration.target')} initialValue={endpoint} disabled={working} onChange={setEndpoint}/>:<view>
        <text className="List-label">{t('migration.target')}</text><text className="Section-note" text-selection={true}>{view.targetEndpoint}</text>
        <text className="List-label">{t('migration.serviceIdentity')}</text><text className="Workflow-code" text-selection={true}>{view.targetServiceId}</text>
        <text className="Section-note" text-selection={true}>{t('migration.operation')} · {view.operationId}</text>
        {MIGRATION_COUNT_FIELDS.map(field=><text className="List-label" key={field}>{t(`migration.count.${field}`)} · {view.counts[field]}</text>)}
        <text className="Section-note">{t('migration.scope')}</text>
      </view>}
      {(draft || review || resumable) && <view key={draftVersion}>
        <WorkflowField id="migration-password" label={t('migration.password')} type="password" disabled={working} onChange={v=>{password.current=v;setError(null);}}/>
        {(review || resumable) && <WorkflowField id="migration-backup-password" label={t('migration.backupPassword')} hint={t('migration.backupHint')} type="password" disabled={working} onChange={v=>{backupPassword.current=v;setError(null);}}/>}
      </view>}
      {(review || resumable) && <WorkflowChoice t={t} label={t('migration.consent')} selected={consent} disabled={working} onTap={()=>setConsent(v=>!v)}/>}
      {phase==='active' && <view><text className="Section-note">{t('migration.rollbackNote')}</text><WorkflowChoice t={t} label={t('migration.rollbackConsent')} selected={consent} disabled={working} onTap={()=>setConsent(v=>!v)}/></view>}
      {(working || review || resumable) && <view><text className="Section-note">{t('migration.pauseNote')}</text><WorkflowButton t={t} label={t('migration.pause')} disabled={phase==='activating' || phase==='pausing'} onTap={()=>void pause()}/></view>}
      {view.errorCode!==null && <text className="Section-note">{t('migration.savedError',{code:view.errorCode})}</text>}
      {view.accountId===null && <text className="Section-note">{t('migration.sourceRequired')}</text>}
      <text className="Section-note">{t('migration.recoveryLimit')}</text>
    </view>}
  </WorkflowSheet>;
}
