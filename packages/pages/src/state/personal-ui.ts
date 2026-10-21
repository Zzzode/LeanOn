import { isIsoDate } from '@zzzode/core';
import { MEASUREMENT_FIELDS, isMeasurement, isProgressPhoto, type MeasurementDto, type MeasurementField, type ProgressPhotoDto, type PersonalMutationDto, type PersonalStateDto, type PersonalMutationRequestDto } from '@zzzode/data';
import { newRecordId } from './record-mutation.js';

export type MeasurementDraft = Record<MeasurementField,string> & {date:string;note:string};
export function measurementDraft(record: MeasurementDto | null, date: string): MeasurementDraft {
  const values:Record<MeasurementField,string>={waistCm:'',hipCm:'',chestCm:'',armCm:'',thighCm:'',neckCm:''};
  for(const key of MEASUREMENT_FIELDS)values[key]=record?.[key]===undefined?'':String(record[key]);
  return {...values,date:record?.date??date,note:record?.note??''};
}
export function measurementFromDraft(draft: MeasurementDraft, id: string, today: string): MeasurementDto | null {
  if(!isIsoDate(draft.date)||draft.date>today||draft.note.length>2000)return null;
  const result:MeasurementDto={id,date:draft.date,...(draft.note.trim()===''?{}:{note:draft.note})};
  for(const key of MEASUREMENT_FIELDS){
    const value=draft[key].trim();if(value==='')continue;
    if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))return null;
    result[key]=Number(value);
  }
  return isMeasurement(result)?result:null;
}
export function photoMetadataDraft(photo: ProgressPhotoDto, date: string, view: ProgressPhotoDto['view'], note: string, today: string): ProgressPhotoDto | null {
  if(!isIsoDate(date)||date>today||note.length>2000)return null;
  const {note:previousNote,...metadata}=photo;
  const result={...metadata,date,view,...(note.trim()===''?{}:{note})};
  return isProgressPhoto(result)?result:null;
}
/** Repeated retries retain their operation identity and the revision captured when editing began. */
export function personalRequest(previous: PersonalMutationRequestDto | null, revision: number, mutation: PersonalMutationDto): PersonalMutationRequestDto {
  if(previous!==null&&JSON.stringify(previous.mutation)===JSON.stringify(mutation))return previous;
  return {operationId:newRecordId('personal-op'),expectedRevision:revision,mutation};
}

export interface PhotoPickRequest {date:string;view:ProgressPhotoDto['view'];note?:string;expectedRevision:number;operationId:string}
export function photoPickRequest(previous:PhotoPickRequest|null,revision:number,date:string,view:ProgressPhotoDto['view'],note:string):PhotoPickRequest {
  const value={date,view,...(note.trim()===''?{}:{note})};
  if(previous!==null&&previous.date===date&&previous.view===view&&previous.note===value.note)return previous;
  return {...value,operationId:newRecordId('photo-import'),expectedRevision:revision};
}
export function reviewPersonalRequest(request:{expectedRevision:number},latest:PersonalStateDto):void {request.expectedRevision=latest.revision;}
