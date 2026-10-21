import { updateBarcodeFeedback, type BarcodeFeedback, type BarcodeFeedbackEvent } from '../state/barcode-feedback.js';
import type { RegisterInnerDismiss } from '../state/modal-dismiss.js';
import { useEffect, useRef, useState } from '@lynx-js/react';
import type { ScannerStatus } from '@zzzode/bridge';
import type { MessageKey, Translator } from '@zzzode/i18n';
import type { ScanFoodError, ScanFoodPhase, ScanFoodResult } from '../state/scan-food.js';
import { useTheme } from './ThemeContext.js';
import { SheetFeedback } from './SheetFeedback.js';

export interface BarcodeLookupSheetProps {
  t:Translator;date?:string;canCamera:boolean;canLookup:boolean;canCreate:boolean;
  onGetStatus:()=>Promise<ScannerStatus>;
  onScan:(allowPermission:boolean,onPhase:(phase:ScanFoodPhase)=>void,isCancelled:()=>boolean)=>Promise<ScanFoodResult>;
  onLookup:(barcode:string,onPhase:(phase:ScanFoodPhase)=>void,isCancelled:()=>boolean)=>Promise<ScanFoodResult>;
  onClose:()=>void;onCreate:()=>void;registerInnerDismiss?:RegisterInnerDismiss;
}
const errorKeys:Record<ScanFoodError,MessageKey>={cameraUnavailable:'barcode.noCamera',cameraPermission:'barcode.denied',permissionNotRequested:'barcode.notRequested',cameraRestricted:'barcode.restricted',hostMissing:'barcode.hostMissing',scannerUnsupported:'barcode.scannerMissing',invalidBarcode:'barcode.invalid',lookupUnavailable:'barcode.unavailable',lookupOffline:'barcode.offline',lookupResponseError:'barcode.responseError',lookupUnsupported:'barcode.lookupMissing',lookupTimeout:'barcode.timeout',notFound:'barcode.notFound',noEnergy:'barcode.noEnergy',nutritionUnit:'barcode.nutritionUnit',persistFailed:'barcode.persistFailed'};
const phaseKeys:Record<ScanFoodPhase,MessageKey>={checking:'barcode.checking',scanning:'barcode.scanning',lookup:'barcode.loading',importing:'barcode.importing'};

/** Camera status is read-only; the permission prompt requires its own explicit user action. */
export function BarcodeLookupSheet({t,date,canCamera,canLookup,canCreate,onGetStatus,onScan,onLookup,onClose,onCreate,registerInnerDismiss}:BarcodeLookupSheetProps) {
  const palette=useTheme();
  const feedback = useRef<BarcodeFeedback>({value:'',error:null});
  const [status,setStatus]=useState<ScannerStatus|null>(null);
  const [statusLoading,setStatusLoading]=useState(canCamera);
  const [statusError,setStatusError]=useState(false);
  const [phase,setPhase]=useState<ScanFoodPhase|null>(null);
  const [error,setError]=useState<ScanFoodError|null>(null);
  const recordFeedback = (event: BarcodeFeedbackEvent) => {
    feedback.current = updateBarcodeFeedback(feedback.current,event);
    setError(feedback.current.error);
  };
  const [focused,setFocused]=useState(false);
  const mounted=useRef(true);const pending=useRef(false);const phaseRef=useRef<ScanFoodPhase|null>(null);
  const operation=useRef(0);const statusRevision=useRef(0);
  const refreshStatus=async()=>{
    if(!canCamera)return;
    const revision=++statusRevision.current;setStatusLoading(true);setStatusError(false);
    try {const next=await onGetStatus();if(mounted.current&&revision===statusRevision.current)setStatus(next);}
    catch {if(mounted.current&&revision===statusRevision.current){setStatus(null);setStatusError(true);}}
    finally {if(mounted.current&&revision===statusRevision.current)setStatusLoading(false);}
  };
  useEffect(()=>{void refreshStatus();return()=>{mounted.current=false;operation.current+=1;statusRevision.current+=1;};},[]);
  const close=()=>{if(phaseRef.current==='importing')return;operation.current+=1;onClose();};
  useEffect(()=>registerInnerDismiss?.(close),[registerInnerDismiss,onClose]);
  const run=async(camera:boolean)=>{
    if(pending.current||!canLookup)return;
    pending.current=true;const revision=++operation.current;recordFeedback({type:'clear-error'});
    const update=(next:ScanFoodPhase)=>{phaseRef.current=next;if(mounted.current&&revision===operation.current)setPhase(next);};
    update(camera?'checking':'lookup');
    try {
      const cancelled=()=>!mounted.current||revision!==operation.current;
      const result=camera?await onScan(status?.permission==='not-determined',update,cancelled):await onLookup(feedback.current.value,update,cancelled);
      if(cancelled())return;
      if(result.kind==='error'){
        recordFeedback({type:'lookup-error',error:result.error,...(result.barcode===undefined?{}:{barcode:result.barcode})});
        if(result.barcode!==undefined){lynx.createSelectorQuery().select('#barcode-input').invoke({method:'setValue',params:{value:result.barcode}}).exec();}
      } else if(result.kind!=='cancelled')onClose();
    } catch {if(mounted.current&&revision===operation.current)recordFeedback({type:'lookup-error',error:'lookupUnavailable'});}
    finally {pending.current=false;phaseRef.current=null;if(mounted.current&&revision===operation.current)setPhase(null);}
  };
  const cameraKey:MessageKey=!canCamera?'barcode.scannerMissing':statusError?'barcode.statusError':status===null?'barcode.checking':!status.hostAvailable?'barcode.hostMissing':!status.cameraAvailable?'barcode.noCamera':status.permission==='not-determined'?'barcode.notRequested':status.permission==='denied'?'barcode.denied':status.permission==='restricted'?'barcode.restricted':'barcode.cameraReady';
  const cameraEnabled=canCamera&&canLookup&&!statusLoading&&status!==null&&status.cameraAvailable&&status.hostAvailable&&(status.permission==='authorized'||status.permission==='not-determined')&&phase===null;
  const cameraLabel=t(status?.permission==='not-determined'?'barcode.allowCamera':'barcode.camera');
  return <view className="Sheet-overlay" bindtap={close}><view className="Sheet Theme-food" catchtap={()=>{}}>
    <text className="Sheet-title">{t('barcode.title')}</text>
    {date!==undefined&&<text className="Section-note">{t('daily.date')} · {date}</text>}
    <scroll-view scroll-orientation="vertical" className="Sheet-body-scroll">
      <text className="Section-note">{t('barcode.source')}</text>
      <text className="Section-note" accessibility-element={true}>{t(cameraKey)}</text>
      <view className={`Action-btn${cameraEnabled?'':' disabled'}`} accessibility-element={true} accessibility-traits={cameraEnabled?'button':'disabled'} accessibility-label={cameraLabel} bindtap={cameraEnabled?()=>void run(true):undefined}><text className="Action-label">{cameraLabel}</text></view>
      {canCamera&&phase===null&&<view className="Action-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t('barcode.checkAgain')} bindtap={()=>void refreshStatus()}><text className="Action-label">{t('barcode.checkAgain')}</text></view>}
      <text className="Form-label">{t('barcode.manual')}</text>
      <view className={`Sheet-field${focused?' focused':''}`}><input id="barcode-input" className="Sheet-input" style={{fontSize:'20px'}} placeholder-color={palette.muted} caret-color={palette.foodText} type="number" disabled={phase!==null} confirm-type="search" accessibility-element={true} accessibility-label={t('barcode.manual')} placeholder={t('barcode.hint')} bindinput={(event:{detail:{value:string}})=>{recordFeedback({type:'input',value:event.detail.value});}} bindfocus={()=>setFocused(true)} bindblur={()=>setFocused(false)} bindconfirm={()=>{lynx.createSelectorQuery().select('#barcode-input').invoke({method:'blur'}).exec();void run(false);}}/></view>
      {!canLookup&&<text className="Section-note">{t('barcode.lookupMissing')}</text>}
      {canCreate&&phase===null&&<view className="Action-btn" accessibility-element={true} accessibility-traits="button" accessibility-label={t('barcode.create')} bindtap={onCreate}><text className="Action-label">{t('barcode.create')}</text></view>}
    </scroll-view>
    <SheetFeedback message={error===null?null:t(errorKeys[error])}/>
    {phase!==null&&<text className="Section-note" accessibility-element={true}>{t(phaseKeys[phase])}</text>}
    <view className="Sheet-actions">
      <view className={`Sheet-btn${phase==='importing'?' disabled':''}`} accessibility-element={true} accessibility-traits={phase==='importing'?'disabled':'button'} accessibility-label={t('barcode.back')} bindtap={phase==='importing'?undefined:close}><text className="Sheet-btn-label">{t('barcode.back')}</text></view>
      <view className={`Sheet-btn primary${phase!==null||!canLookup?' disabled':''}`} accessibility-element={true} accessibility-traits={phase!==null||!canLookup?'disabled':'button'} accessibility-label={t(error===null?'barcode.lookup':'barcode.retry')} bindtap={phase!==null||!canLookup?undefined:()=>void run(false)}><text className="Sheet-btn-label primary">{t(error===null?'barcode.lookup':'barcode.retry')}</text></view>
    </view>
  </view></view>;
}
