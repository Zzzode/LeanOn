import { isIsoDateTime } from '@zzzode/core';
import type { BackupPreviewDto } from '@zzzode/data';

/** Count UTF-8 without assuming TextEncoder exists in the native JS runtime. */
export function backupPasswordValid(value: string): boolean {
  let bytes=0;
  for(let index=0;index<value.length;index++){
    const code=value.charCodeAt(index);
    if(code>=0xd800&&code<=0xdbff){
      const low=value.charCodeAt(++index);if(!Number.isFinite(low)||low<0xdc00||low>0xdfff)return false;bytes+=4;
    }else if(code>=0xdc00&&code<=0xdfff)return false;
    else bytes+=code<=0x7f?1:code<=0x7ff?2:3;
    if(bytes>1024)return false;
  }
  return bytes>=12;
}
export interface BackupInspection {token:string;expiresAt:string;summary:BackupPreviewDto & {hasProfile:boolean;includesPhotos:boolean};expectedRecordsRevision:number;expectedPersonalRevision:number}
function integer(value:unknown):value is number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;}
/** An import preview is read-only and must be complete before the UI can ask for replacement consent. */
export function readBackupInspection(value: unknown): BackupInspection | null {
  if(typeof value!=='object'||value===null||Array.isArray(value))return null;
  const data=value as Record<string,unknown>;const summary=data.summary;
  if(typeof data.token!=='string'||data.token.length===0||typeof data.expiresAt!=='string'||!isIsoDateTime(data.expiresAt)||!integer(data.expectedRecordsRevision)||!integer(data.expectedPersonalRevision)||typeof summary!=='object'||summary===null||Array.isArray(summary))return null;
  const preview=summary as Record<string,unknown>;const counts=preview.counts;
  if(typeof preview.hasProfile!=='boolean'||typeof preview.includesPhotos!=='boolean'||!isIsoDateTime(preview.createdAt)||!integer(preview.recordRevision)||!integer(preview.personalRevision)||!integer(preview.photoBytes)||typeof counts!=='object'||counts===null||Array.isArray(counts))return null;
  const names=['weights','water','exercises','intakeEntries','legacyIntake','customFoods','measurements','photos'];
  if(!names.every(key=>integer((counts as Record<string,unknown>)[key])))return null;
  return {token:data.token,expiresAt:data.expiresAt,summary:summary as BackupInspection['summary'],expectedRecordsRevision:data.expectedRecordsRevision,expectedPersonalRevision:data.expectedPersonalRevision};
}
