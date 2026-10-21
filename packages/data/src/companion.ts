import { isIsoDate, isIsoDateTime } from '@zzzode/core';
import { defaultShareSettings } from './privacy.js';
import type { ShareCategory, ShareSettings } from './privacy.js';
import { isMeasurement, isProgressPhoto } from './personal.js';
import type { MeasurementDto, ProgressPhotoDto } from './personal.js';
import { exactKeys, finiteRange, isJsonValue, isPlainObject, safeId, uniqueIds, withoutCredentials } from './validation.js';
export interface CompanionAccountDto { id: string; displayName: string }
export interface CompanionBindingDto { id: string; peer: CompanionAccountDto; createdAt: string }
/** Acceptance is pending until the creator explicitly confirms it. */
export interface CompanionInvitationDto {
  id: string; kind: 'family' | 'device'; direction: 'incoming' | 'outgoing';
  status: 'pending' | 'awaiting-confirmation'; expiresAt: string;
  recipientId: string | null; recipientDeviceId: string | null;
}
export interface CompanionMessageDto {
  id: string; text: string; createdAt: string; direction: 'incoming' | 'outgoing';
  status: 'pending' | 'delivered'; deliveredAt?: string;
}
export interface CompanionPeerSnapshotDto {
  updatedAt: string; sharedCategories: ShareCategory[];
  goal?: { guidanceMode: 'weight-loss' | 'tracking-only'; weeklyLossKg?: number };
  progressBand?: 'steady' | 'changing' | 'maintaining' | 'insufficient-data';
  checkinStreak?: number; exactWeightKg?: number;
  meals?: { date: string; name: string; kcal: number }[];
  photos?: ProgressPhotoDto[]; measurements?: MeasurementDto[];
  menstrual?: { startDate: string; cycleLengthDays?: number }[];
}
/** Credentials and invitation proofs live ONLY in platform secure storage. */
export interface CompanionStateDto {
  version: 1; account: CompanionAccountDto | null; sessionExpiresAt: string | null;
  binding: CompanionBindingDto | null; shareSettings: ShareSettings;
  peerSnapshot: CompanionPeerSnapshotDto | null; invitations: CompanionInvitationDto[]; messages: CompanionMessageDto[];
}
export function createSignedOutCompanionState(): CompanionStateDto {
  return {version:1,account:null,sessionExpiresAt:null,binding:null,shareSettings:defaultShareSettings(),peerSnapshot:null,invitations:[],messages:[]};
}
const CATEGORIES:readonly ShareCategory[]=['goal','progress_band','checkin_streak','meals','photos','menstrual','exact_weight','body_measurements','encouragement'];
export function isShareSettings(value:unknown):value is ShareSettings {
  return isPlainObject(value) && exactKeys(value,['mutual','categories']) && typeof value.mutual==='boolean' &&
    Array.isArray(value.categories) && value.categories.every(category=>CATEGORIES.includes(category as ShareCategory)) && new Set(value.categories).size===value.categories.length;
}
function account(value:unknown):value is CompanionAccountDto {
  return isPlainObject(value) && exactKeys(value,['id','displayName']) && safeId(value.id) && typeof value.displayName==='string' && value.displayName.trim().length>0 && value.displayName.length<=100;
}
export function isCompanionMessage(value:unknown):value is CompanionMessageDto {
  return isPlainObject(value) && exactKeys(value,['id','text','createdAt','direction','status','deliveredAt']) && safeId(value.id) && typeof value.text==='string' && value.text.trim().length>0 && value.text.length<=2000 &&
    isIsoDateTime(value.createdAt) && ['incoming','outgoing'].includes(String(value.direction)) &&
    // Sender and relay clocks can differ; an authenticated receipt determines delivery.
    (value.status==='pending' ? value.deliveredAt===undefined : value.status==='delivered' && isIsoDateTime(value.deliveredAt));
}
export function isCompanionPeerSnapshot(value:unknown):value is CompanionPeerSnapshotDto {
  if(!isPlainObject(value) || !exactKeys(value,['updatedAt','sharedCategories','goal','progressBand','checkinStreak','exactWeightKg','meals','photos','measurements','menstrual']) || !isIsoDateTime(value.updatedAt) ||
    !Array.isArray(value.sharedCategories) || !value.sharedCategories.every(category=>CATEGORIES.includes(category as ShareCategory)) || new Set(value.sharedCategories).size!==value.sharedCategories.length) return false;
  const mapping:Readonly<Record<string,ShareCategory>>={goal:'goal',progressBand:'progress_band',checkinStreak:'checkin_streak',exactWeightKg:'exact_weight',meals:'meals',photos:'photos',measurements:'body_measurements',menstrual:'menstrual'};
  if(Object.entries(mapping).some(([key,category])=>value[key]!==undefined && !(value.sharedCategories as unknown[]).includes(category))) return false;
  return (value.goal===undefined || (isPlainObject(value.goal) && exactKeys(value.goal,['guidanceMode','weeklyLossKg']) && ['weight-loss','tracking-only'].includes(String(value.goal.guidanceMode)) && (value.goal.weeklyLossKg===undefined || finiteRange(value.goal.weeklyLossKg,0,1)))) &&
    (value.progressBand===undefined || ['steady','changing','maintaining','insufficient-data'].includes(String(value.progressBand))) &&
    (value.checkinStreak===undefined || (finiteRange(value.checkinStreak,0,100000) && Number.isInteger(value.checkinStreak))) &&
    (value.exactWeightKg===undefined || finiteRange(value.exactWeightKg,20,300)) &&
    (value.meals===undefined || (Array.isArray(value.meals) && value.meals.length<=1000 && value.meals.every(row=>isPlainObject(row) && exactKeys(row,['date','name','kcal']) && isIsoDate(row.date) && typeof row.name==='string' && row.name.length<=1000 && finiteRange(row.kcal,0,1000000)))) &&
    (value.photos===undefined || (Array.isArray(value.photos) && value.photos.length<=1000 && value.photos.every(isProgressPhoto) && uniqueIds(value.photos))) &&
    (value.measurements===undefined || (Array.isArray(value.measurements) && value.measurements.length<=100000 && value.measurements.every(isMeasurement) && uniqueIds(value.measurements))) &&
    (value.menstrual===undefined || (Array.isArray(value.menstrual) && value.menstrual.length<=1000 && value.menstrual.every(row=>isPlainObject(row) && exactKeys(row,['startDate','cycleLengthDays']) && isIsoDate(row.startDate) && (row.cycleLengthDays===undefined || finiteRange(row.cycleLengthDays,1,365)))));
}
export function isCompanionState(value:unknown):value is CompanionStateDto {
  if(!isPlainObject(value) || !exactKeys(value,['version','account','sessionExpiresAt','binding','shareSettings','peerSnapshot','invitations','messages']) || value.version!==1 || !isJsonValue(value) || !withoutCredentials(value) ||
    !(value.account===null || account(value.account)) || !(value.sessionExpiresAt===null || isIsoDateTime(value.sessionExpiresAt)) || !isShareSettings(value.shareSettings) ||
    !(value.binding===null || (isPlainObject(value.binding) && exactKeys(value.binding,['id','peer','createdAt']) && safeId(value.binding.id) && account(value.binding.peer) && isIsoDateTime(value.binding.createdAt))) ||
    !(value.peerSnapshot===null || isCompanionPeerSnapshot(value.peerSnapshot)) || !Array.isArray(value.messages) || value.messages.length>1000 || !value.messages.every(isCompanionMessage) || !uniqueIds(value.messages) ||
    !Array.isArray(value.invitations) || value.invitations.length>1000 || !value.invitations.every(row=>isPlainObject(row) && exactKeys(row,['id','kind','direction','status','expiresAt','recipientId','recipientDeviceId']) && safeId(row.id) && ['family','device'].includes(String(row.kind)) && ['incoming','outgoing'].includes(String(row.direction)) && ['pending','awaiting-confirmation'].includes(String(row.status)) && isIsoDateTime(row.expiresAt) && (row.recipientId===null || safeId(row.recipientId)) && (row.recipientDeviceId===null || safeId(row.recipientDeviceId))) || !uniqueIds(value.invitations as CompanionInvitationDto[])) return false;
  if(value.account===null) return value.sessionExpiresAt===null && value.binding===null && value.peerSnapshot===null && value.messages.length===0 && value.invitations.length===0 && value.shareSettings.categories.length===0;
  return value.sessionExpiresAt!==null && (value.binding!==null || (value.peerSnapshot===null && value.messages.length===0));
}
export function hasCurrentCompanionSession(state:CompanionStateDto,now:string):boolean {
  return isCompanionState(state) && state.account!==null && state.sessionExpiresAt!==null && isIsoDateTime(now) && Date.parse(state.sessionExpiresAt)>Date.parse(now);
}

/** Public recovery status only; deletion capabilities remain in native secure storage. */
export interface CompanionAccountDeletionDto {
  phase: 'prepared' | 'confirmed' | 'local-complete';
  accountId: string; displayName: string; deleteLocalData: boolean; localDataChanged: boolean;
}
export interface CompanionRuntimeDto {
  endpoint: string | null; deviceAuthorized: boolean; localDataAccountId: string | null; syncState: 'idle' | 'syncing' | 'offline' | 'error';
  pendingChanges: number; lastSyncAt: string | null; nativeNow: string; errorCode: string | null;
  accountDeletion: CompanionAccountDeletionDto | null;
}
export interface CompanionResponseDto { companion: CompanionStateDto; runtime: CompanionRuntimeDto }
export function isCompanionResponse(value:unknown):value is CompanionResponseDto {
  if(!isPlainObject(value) || !exactKeys(value,['companion','runtime']) || !isCompanionState(value.companion) || !isPlainObject(value.runtime)) return false;
  const runtime=value.runtime;
  return exactKeys(runtime,['endpoint','deviceAuthorized','localDataAccountId','syncState','pendingChanges','lastSyncAt','nativeNow','errorCode','accountDeletion']) &&
    (runtime.accountDeletion===null || (isPlainObject(runtime.accountDeletion) &&
      exactKeys(runtime.accountDeletion,['phase','accountId','displayName','deleteLocalData','localDataChanged']) &&
      ['prepared','confirmed','local-complete'].includes(String(runtime.accountDeletion.phase)) && safeId(runtime.accountDeletion.accountId) &&
      typeof runtime.accountDeletion.displayName==='string' && runtime.accountDeletion.displayName.trim().length>0 && runtime.accountDeletion.displayName.length<=100 &&
      typeof runtime.accountDeletion.deleteLocalData==='boolean' && typeof runtime.accountDeletion.localDataChanged==='boolean')) &&
    (runtime.endpoint===null || (typeof runtime.endpoint==='string' && runtime.endpoint.length<=2048 && /^https?:\/\/[^\s@?#]+(?:\/[^\s?#]*)?$/.test(runtime.endpoint))) &&
    typeof runtime.deviceAuthorized==='boolean' && (runtime.localDataAccountId===null || safeId(runtime.localDataAccountId)) && ['idle','syncing','offline','error'].includes(String(runtime.syncState)) &&
    finiteRange(runtime.pendingChanges,0,1000000) && Number.isInteger(runtime.pendingChanges) && (runtime.lastSyncAt===null || isIsoDateTime(runtime.lastSyncAt)) &&
    isIsoDateTime(runtime.nativeNow) && (runtime.errorCode===null || safeId(runtime.errorCode));
}
