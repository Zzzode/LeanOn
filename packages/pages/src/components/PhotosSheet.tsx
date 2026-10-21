import {usePhotoPageAnchor} from '../state/photo-page-anchor.js';
import {photoPage} from '../state/photo-page.js';
import {PhotoPager} from './PhotoPager.js';
import { PhotoPreviewContext } from './PhotoPreviewContext.js';
import { createPhotoPreviewLoader,type PhotoPreviewState } from '../state/photo-preview.js';
import { useContext, useEffect, useRef, useState } from '@lynx-js/react';
import type { PersonalMutationRequestDto, PersonalStateDto, ProgressPhotoDto } from '@zzzode/data';
import { isIsoDate } from '@zzzode/core';
import type { Translator } from '@zzzode/i18n';
import { personalRequest, photoMetadataDraft, photoPickRequest, type PhotoPickRequest } from '../state/personal-ui.js';
import { isRecordConflict } from '../state/record-mutation.js';
import { WorkflowButton, WorkflowChoice, WorkflowField, WorkflowSheet } from './WorkflowSheet.js';

export type {PhotoPickRequest} from '../state/personal-ui.js';

export function LocalPhoto({photo,t,onRead,scope='own'}:{photo:ProgressPhotoDto;t:Translator;onRead:(id:string)=>Promise<string>;scope?:'own'|'partner'}) {
  const lifecycle=useContext(PhotoPreviewContext);const epoch=scope==='own'?lifecycle.own:lifecycle.partner;
  const [preview,setPreview]=useState<PhotoPreviewState>({uri:null,error:false,loading:true,generation:0});const [retry,setRetry]=useState(0);
  const reader=useRef(onRead);reader.current=onRead;
  const loader=useRef(createPhotoPreviewLoader(setPreview));
  useEffect(()=>{
    if(lifecycle.paused){loader.current.suspend();return;}
    return loader.current.load(photo.id,id=>reader.current(id));
  },[photo.id,epoch,retry,lifecycle.paused]);
  if(lifecycle.paused)return null;
  return <view>
    {preview.uri!==null&&<image className="Workflow-photo" src={preview.uri} mode="aspectFit" accessibility-element={true} accessibility-label={`${photo.date} : ${t(`personal.${photo.view}`)}`} binderror={()=>{if(preview.uri!==null)loader.current.imageFailed(preview.uri,preview.generation);}}/>}
    {preview.loading&&<text className="Section-note">{t('closure.loading')}</text>}
    {preview.error&&<view><text className="Section-note">{t('personal.photoUnavailable')}</text><WorkflowButton t={t} label={t('closure.retry')} onTap={()=>setRetry(value=>value+1)}/></view>}
  </view>;
}

function PhotoForm({photo,revision,today,t,onClose,onSave,onPick}:{photo:ProgressPhotoDto|null;revision:number;today:string;t:Translator;onClose:()=>void;onSave:(request:PersonalMutationRequestDto)=>Promise<void>;onPick:(request:PhotoPickRequest)=>Promise<boolean>}) {
  const [date,setDate]=useState(photo?.date??today);const [view,setView]=useState<ProgressPhotoDto['view']>(photo?.view??'front');const [note,setNote]=useState(photo?.note??'');
  const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const pending=useRef(false);
  const pickRequest=useRef<PhotoPickRequest|null>(null);const request=useRef<PersonalMutationRequestDto|null>(null);
  const save=async()=>{
    if(pending.current)return;
    if(!isIsoDate(date)||date>today||note.length>2000){setError(t('personal.photoInvalid'));return;}
    pending.current=true;setBusy(true);setError(null);
    try{
      if(photo===null){pickRequest.current=photoPickRequest(pickRequest.current,revision,date,view,note);if(!await onPick(pickRequest.current))return;}
      else {
        const updated=photoMetadataDraft(photo,date,view,note,today);
        if(updated===null){setError(t('personal.photoInvalid'));return;}
        request.current=personalRequest(request.current,revision,{type:'update-photo',photo:updated});await onSave(request.current);
      }
      onClose();
    }catch(error){if(!(typeof error==='object'&&error!==null&&'code' in error&&error.code==='cancelled'))setError(t(isRecordConflict(error)?'personal.conflict':'personal.saveError'));}
    finally{pending.current=false;setBusy(false);}
  };
  return <WorkflowSheet t={t} title={t(photo===null?'personal.addPhoto':'personal.editPhoto')} note={t('personal.private')} busy={busy} feedback={error} onClose={onClose} onSave={()=>void save()} saveLabel={t(photo===null?'personal.addPhoto':'daily.save')}>
    <text className="Section-note">{t('personal.photoNote')}</text>
    <WorkflowField id="photo-date" label={t('daily.date')} initialValue={date} hint={t('daily.dateHint')} disabled={busy} onChange={value=>{setDate(value);setError(null);}}/>
    <text className="Section-heading">{t('personal.view')}</text>
    {(['front','side','back','other'] as const).map(value=><WorkflowChoice t={t} key={value} label={t(`personal.${value}`)} selected={view===value} disabled={busy} onTap={()=>{setView(value);setError(null);}}/>)}
    <WorkflowField id="photo-note" label={t('personal.notes')} initialValue={note} disabled={busy} onChange={value=>{setNote(value);setError(null);}}/>
  </WorkflowSheet>;
}

export function PhotosSheet({personal,today,t,onClose,onSave,onPick,onRead}:{personal:PersonalStateDto;today:string;t:Translator;onClose:()=>void;onSave:(request:PersonalMutationRequestDto)=>Promise<void>;onPick:(request:PhotoPickRequest)=>Promise<boolean>;onRead:(id:string)=>Promise<string>}) {
  const [page,setPage]=useState(0);
  const photos=photoPage(personal.photos.slice().sort((a,b)=>b.date.localeCompare(a.date)),page);
  const anchor=usePhotoPageAnchor(photos.index);
  const [editing,setEditing]=useState<ProgressPhotoDto|null|undefined>(undefined);const [editRevision,setEditRevision]=useState(personal.revision);
  const [deleting,setDeleting]=useState<ProgressPhotoDto|null>(null);const deleteRevision=useRef(personal.revision);
  const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const pending=useRef(false);const request=useRef<PersonalMutationRequestDto|null>(null);
  const remove=async()=>{
    if(deleting===null||pending.current)return;request.current=personalRequest(request.current,deleteRevision.current,{type:'delete-photo',id:deleting.id});pending.current=true;setBusy(true);setError(null);
    try{await onSave(request.current);setDeleting(null);}catch(error){setError(t(isRecordConflict(error)?'personal.conflict':'personal.saveError'));}finally{pending.current=false;setBusy(false);}
  };
  if(editing!==undefined)return <PhotoForm key={editing?.id??'new'} photo={editing} revision={editRevision} today={today} t={t} onClose={()=>setEditing(undefined)} onSave={onSave} onPick={onPick}/>;
  if(deleting!==null)return <WorkflowSheet t={t} title={t('personal.deletePhoto')} busy={busy} feedback={error} onClose={()=>setDeleting(null)} onSave={()=>void remove()} saveLabel={t('daily.delete')}>
    <text className="Section-note">{t('personal.deleteNote')}</text><text className="List-label">{deleting.date} · {t(`personal.${deleting.view}`)}</text><LocalPhoto photo={deleting} t={t} onRead={onRead}/>
  </WorkflowSheet>;
  return <WorkflowSheet t={t} title={t('personal.photos')} note={t('personal.galleryPrivacy')} onClose={onClose}>
    <WorkflowButton t={t} label={t('personal.addPhoto')} primary onTap={()=>{setEditRevision(personal.revision);setEditing(null);}}/>
    {personal.photos.length===0&&<text className="Empty-body">{t('personal.photoEmpty')}</text>}
    <view id={anchor} flatten={false}>
    {photos.items.map(photo=><view key={photo.id} className="Workflow-list-item">
      <text className="List-label">{photo.date} · {t(`personal.${photo.view}`)}</text><LocalPhoto photo={photo} t={t} onRead={onRead}/>
      {photo.note!==undefined&&<text className="Section-note">{photo.note}</text>}
      <view className="Workflow-actions Photo-actions"><WorkflowButton t={t} label={t('personal.editPhoto')} accessibleLabel={`${t('personal.editPhoto')} ${photo.date} ${t(`personal.${photo.view}`)}`} onTap={()=>{setEditRevision(personal.revision);setEditing(photo);}}/><WorkflowButton t={t} label={t('daily.delete')} accessibleLabel={`${t('personal.deletePhoto')} ${photo.date} ${t(`personal.${photo.view}`)}`} danger onTap={()=>{deleteRevision.current=personal.revision;request.current=null;setDeleting(photo);setError(null);}}/></view>
    </view>)}
    </view>
    <PhotoPager t={t} index={photos.index} totalPages={photos.totalPages} onPage={setPage}/>
  </WorkflowSheet>;
}
