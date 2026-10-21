import { useMemo, useRef, useState } from '@lynx-js/react';
import { MEASUREMENT_FIELDS, compareMeasurementTrend, type MeasurementDto, type MeasurementField, type PersonalMutationRequestDto, type PersonalStateDto } from '@zzzode/data';
import type { Translator } from '@zzzode/i18n';
import { measurementDraft, measurementFromDraft, personalRequest } from '../state/personal-ui.js';
import { isRecordConflict, newRecordId } from '../state/record-mutation.js';
import { useTheme } from './ThemeContext.js';
import { WorkflowButton, WorkflowChoice, WorkflowField, WorkflowSheet } from './WorkflowSheet.js';

function MeasurementForm({record,revision,today,t,onClose,onSave}:{record:MeasurementDto|null;revision:number;today:string;t:Translator;onClose:()=>void;onSave:(request:PersonalMutationRequestDto)=>Promise<void>}) {
  const [draft,setDraft]=useState(()=>measurementDraft(record,today));const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
  const id=useRef(record?.id??newRecordId('measurement'));const request=useRef<PersonalMutationRequestDto|null>(null);const pending=useRef(false);
  const save=async()=>{
    if(pending.current)return;const measurement=measurementFromDraft(draft,id.current,today);
    if(measurement===null){setError(t('personal.measurementInvalid'));return;}
    request.current=personalRequest(request.current,revision,{type:'save-measurement',measurement});
    pending.current=true;setBusy(true);setError(null);
    try{await onSave(request.current);onClose();}catch(error){setError(t(isRecordConflict(error)?'personal.conflict':'personal.saveError'));}finally{pending.current=false;setBusy(false);}
  };
  return <WorkflowSheet t={t} title={t(record===null?'personal.addMeasurement':'personal.editMeasurement')} busy={busy} feedback={error} onClose={onClose} onSave={()=>void save()}>
    <text className="Section-note">{t('personal.measurementNote')}</text>
    <WorkflowField id="measurement-date" label={t('daily.date')} initialValue={draft.date} hint={t('daily.dateHint')} disabled={busy} onChange={date=>{setDraft(value=>({...value,date}));setError(null);}}/>
    {MEASUREMENT_FIELDS.map(field=><WorkflowField key={field} id={`measurement-${field}`} label={t(`personal.${field}`)} initialValue={draft[field]} type="digit" disabled={busy} onChange={value=>{setDraft(previous=>({...previous,[field]:value}));setError(null);}}/>)}
    <WorkflowField id="measurement-note" label={t('personal.notes')} initialValue={draft.note} disabled={busy} onChange={note=>{setDraft(value=>({...value,note}));setError(null);}}/>
  </WorkflowSheet>;
}

export function MeasurementsSheet({personal,today,t,onClose,onSave}:{personal:PersonalStateDto;today:string;t:Translator;onClose:()=>void;onSave:(request:PersonalMutationRequestDto)=>Promise<void>}) {
  const palette=useTheme();const [editing,setEditing]=useState<MeasurementDto|null|undefined>(undefined);const [editingRevision,setEditingRevision]=useState(personal.revision);
  const [field,setField]=useState<MeasurementField>('waistCm');const [deleting,setDeleting]=useState<MeasurementDto|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
  const pending=useRef(false);const request=useRef<PersonalMutationRequestDto|null>(null);const deleteRevision=useRef(personal.revision);
  const trend=useMemo(()=>compareMeasurementTrend(personal.measurements.filter(row=>row.date<=today),field),[personal.measurements,field,today]);
  const values=trend.points.map(point=>point.valueCm);const minimum=Math.min(...values);const maximum=Math.max(...values);const span=Math.max(maximum-minimum,1);
  const points=trend.points.map((point,index)=>`${20+index*280/Math.max(trend.points.length-1,1)},${110-(point.valueCm-minimum)*80/span}`).join(' ');
  const chart=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 140"><polyline points="${points}" fill="none" stroke="${palette.weight}" stroke-width="3"/>${trend.points.map((point,index)=>`<circle cx="${20+index*280/Math.max(trend.points.length-1,1)}" cy="${110-(point.valueCm-minimum)*80/span}" r="4" fill="${palette.weight}"/>`).join('')}</svg>`;
  const remove=async()=>{
    if(deleting===null||pending.current)return;request.current=personalRequest(request.current,deleteRevision.current,{type:'delete-measurement',id:deleting.id});
    pending.current=true;setBusy(true);setError(null);
    try{await onSave(request.current);setDeleting(null);}catch(error){setError(t(isRecordConflict(error)?'personal.conflict':'personal.saveError'));}finally{pending.current=false;setBusy(false);}
  };
  if(editing!==undefined)return <MeasurementForm key={editing?.id??'new'} record={editing} revision={editingRevision} today={today} t={t} onClose={()=>setEditing(undefined)} onSave={onSave}/>;
  if(deleting!==null)return <WorkflowSheet t={t} title={t('personal.deleteMeasurement')} busy={busy} feedback={error} onClose={()=>setDeleting(null)} onSave={()=>void remove()} saveLabel={t('daily.delete')}>
    <text className="Section-note">{t('personal.deleteNote')}</text><text className="List-label">{deleting.date}</text>
    {MEASUREMENT_FIELDS.filter(key=>deleting[key]!==undefined).map(key=><text key={key} className="List-label">{t(`personal.${key}`)} · {deleting[key]}</text>)}
  </WorkflowSheet>;
  return <WorkflowSheet t={t} title={t('personal.measurements')} note={t('personal.private')} onClose={onClose}>
    <text className="Section-note">{t('personal.measurementNote')}</text>
    <WorkflowButton t={t} label={t('personal.addMeasurement')} primary onTap={()=>{setEditingRevision(personal.revision);setEditing(null);}}/>
    <text className="Section-heading">{t('personal.trend')}</text>
    <view className="Measurement-trend-options">{MEASUREMENT_FIELDS.map(key=><WorkflowChoice t={t} key={key} label={t(`personal.${key}`)} selected={key===field} onTap={()=>setField(key)}/>)}</view>
    {trend.points.length>=2&&<svg style={{width:'100%',height:'160px'}} content={chart} accessibility-hidden={true}/>}
    <text className="Section-note">{trend.changeCm===null?t('personal.noTrend'):t('personal.change',{value:Math.round(trend.changeCm*10)/10})}</text>
    {personal.measurements.length===0&&<text className="Empty-body">{t('personal.measurementEmpty')}</text>}
    {personal.measurements.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(record=><view className="Workflow-list-item" key={record.id}>
      <text className="List-label">{record.date}</text>
      {MEASUREMENT_FIELDS.filter(key=>record[key]!==undefined).map(key=><text key={key} className="Section-note">{t(`personal.${key}`)} · {record[key]}</text>)}
      {record.note!==undefined&&<text className="Section-note">{record.note}</text>}
      <view className="Workflow-actions"><WorkflowButton t={t} label={t('daily.edit')} accessibleLabel={`${t('daily.edit')} ${t('personal.measurements')} ${record.date}`} onTap={()=>{setEditingRevision(personal.revision);setEditing(record);}}/><WorkflowButton t={t} label={t('daily.delete')} accessibleLabel={`${t('daily.delete')} ${t('personal.measurements')} ${record.date}`} danger onTap={()=>{request.current=null;deleteRevision.current=personal.revision;setDeleting(record);setError(null);}}/></view>
    </view>)}
  </WorkflowSheet>;
}
