import { isIsoDateTime, isRecordsState, projectIntake } from '@zzzode/core';
import type { RecordsState } from '@zzzode/core';
import type { FoodItem } from '@zzzode/food-data';
import { isPersonalState } from './personal.js';
import type { PersonalStateDto } from './personal.js';
import { cloneJson, exactKeys, finiteRange, isJsonValue, isPlainObject, safeId, safeRevision, uniqueIds, withoutCredentials } from './validation.js';

export const BACKUP_AAD = 'LeanOn backup v1';
export const BACKUP_ITERATIONS = 600000;
export const MAX_PHOTO_BYTES: number = 20 * 1024 * 1024;
export const MAX_PHOTOS_BYTES: number = 32 * 1024 * 1024;
export const MAX_BACKUP_BYTES: number = 64 * 1024 * 1024;
export interface BackupPhotoDto { id: string; bytesBase64: string }
export interface BackupPayloadDto {
  formatVersion: 1; createdAt: string; records: RecordsState; customFoods: FoodItem[];
  favoriteFoodIds: string[]; recentFoodIds: string[]; personal: PersonalStateDto; photos: BackupPhotoDto[];
}
/** The ciphertext includes its 16-byte GCM authentication tag. */
export interface BackupEnvelopeDto {
  formatVersion: 1; cipher: 'AES-256-GCM'; kdf: 'PBKDF2-HMAC-SHA256'; iterations: 600000;
  salt: string; nonce: string; ciphertext: string;
}
export interface BackupPreviewDto {
  createdAt: string; recordRevision: number; personalRevision: number;
  counts: { weights: number; water: number; exercises: number; intakeEntries: number; legacyIntake: number; customFoods: number; measurements: number; photos: number };
  photoBytes: number;
}
export interface RestorePlan { payload: BackupPayloadDto; preview: BackupPreviewDto }
export class BackupValidationError extends Error {}
export class BackupAuthenticationError extends Error {}
export interface BackupCryptoPort {
  randomBytes(length: number): Promise<Uint8Array>;
  /** PBKDF2-HMAC-SHA256; exact UTF-8 password bytes, no normalization. */
  deriveKey(password: Uint8Array, salt: Uint8Array, iterations: number): Promise<Uint8Array>;
  /** AES-256-GCM, returning ciphertext followed by its tag. */
  seal(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
  /** Must authenticate before returning ANY plaintext; reject on tag failure. */
  open(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
}
/** Codec is injected too: this package has no native, browser or Node imports. */
export interface BackupJsonPort {
  encode(value: BackupPayloadDto): Uint8Array;
  decode(bytes: Uint8Array): unknown;
  utf8(value: string): Uint8Array;
}
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function encodeBase64(bytes: Uint8Array): string {
  let output = '';
  for (let i=0;i<bytes.length;i+=3) {
    const a=bytes[i]??0, b=bytes[i+1]??0, c=bytes[i+2]??0;
    output += ALPHABET[a>>2]!+ALPHABET[((a&3)<<4)|(b>>4)]!+(i+1<bytes.length?ALPHABET[((b&15)<<2)|(c>>6)]:'=')+(i+2<bytes.length?ALPHABET[c&63]:'=');
  }
  return output;
}
export function base64ByteLength(value: unknown, maximum: number=MAX_BACKUP_BYTES): number | null {
  if (typeof value!=='string' || value.length===0 || value.length>Math.ceil(maximum/3)*4 || value.length%4!==0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  const padding=value.endsWith('==')?2:value.endsWith('=')?1:0;
  const length=value.length/4*3-padding;
  if (length>maximum || (padding===2 && (ALPHABET.indexOf(value[value.length-3]??'')&15)!==0) ||
    (padding===1 && (ALPHABET.indexOf(value[value.length-2]??'')&3)!==0)) return null;
  return length;
}
export function decodeBase64(value: string): Uint8Array {
  const length=base64ByteLength(value);
  if (length===null) throw new BackupValidationError('Invalid base64 bytes');
  const bytes=new Uint8Array(length);
  for(let i=0,j=0;i<value.length;i+=4) {
    const bits=(ALPHABET.indexOf(value[i]!)<<18)|(ALPHABET.indexOf(value[i+1]!)<<12)|((ALPHABET.indexOf(value[i+2]!)&63)<<6)|(ALPHABET.indexOf(value[i+3]!)&63);
    if(j<length)bytes[j++]=(bits>>16)&255;if(j<length)bytes[j++]=(bits>>8)&255;if(j<length)bytes[j++]=bits&255;
  }
  return bytes;
}
function nutrition(value: unknown): boolean {
  return isPlainObject(value) && Object.values(value).every(item=>typeof item==='number' && Number.isFinite(item) && item>=0);
}
function isCustomFood(value: unknown): value is FoodItem {
  return isPlainObject(value) && exactKeys(value,['id','name','kcal','macros','micros','defaultGrams','source','barcode']) && safeId(value.id) &&
    isPlainObject(value.name) && exactKeys(value.name,['en','zh-CN']) && ['en','zh-CN'].every(key=>typeof value.name==='object' && value.name!==null &&
      typeof (value.name as Record<string,unknown>)[key]==='string' && String((value.name as Record<string,unknown>)[key]).trim().length>0 && String((value.name as Record<string,unknown>)[key]).length<=1000) &&
    typeof value.kcal==='number' && Number.isFinite(value.kcal) && value.kcal>0 && nutrition(value.macros) && isPlainObject(value.macros) && exactKeys(value.macros,['proteinG','carbsG','fatG']) && ['proteinG','carbsG','fatG'].every(key=>typeof (value.macros as Record<string,unknown>)[key]==='number' && Number.isFinite((value.macros as Record<string,unknown>)[key]) && Number((value.macros as Record<string,unknown>)[key])>=0) &&
    nutrition(value.micros) && isPlainObject(value.micros) && exactKeys(value.micros,['fiberG','sugarG','saturatedFatG','sodiumMg']) && ['fiberG','sugarG','saturatedFatG','sodiumMg'].every(key=>typeof (value.micros as Record<string,unknown>)[key]==='number' && Number.isFinite((value.micros as Record<string,unknown>)[key]) && Number((value.micros as Record<string,unknown>)[key])>=0) &&
    ['custom','open-food-facts'].includes(String(value.source)) && (value.defaultGrams===undefined || typeof value.defaultGrams==='number' && Number.isFinite(value.defaultGrams) && value.defaultGrams>0) &&
    (value.barcode===undefined || (typeof value.barcode==='string' && /^\d{8,14}$/.test(value.barcode)));
}
function validRecords(value: unknown): value is RecordsState {
  if (!isPlainObject(value) || !exactKeys(value,['schemaVersion','revision','setupCompleted','profile','goalWeightKg','weeklyLossKg','guidanceMode','safetyFlags','weights','water','exercises','legacyIntake','intakeEntries','intake','deletedRecords','processedOperations']) || !isRecordsState(value)) return false;
  const collections=[value.weights,value.water,value.exercises,value.legacyIntake,value.intakeEntries,value.intake,value.deletedRecords,value.processedOperations];
  if(collections.some(rows=>rows.length>100000)) return false;
  if(new Set(value.intake.map(row=>row.date)).size!==value.intake.length) return false;
  let projected;
  try { projected=projectIntake(value.legacyIntake,value.intakeEntries); } catch { return false; }
  const byDate=new Map(value.intake.map(row=>[row.date,row]));
  return projected.length===byDate.size && projected.every(row=>{
    const actual=byDate.get(row.date);
    return actual!==undefined && Math.abs(row.kcal-actual.kcal)<=1e-6 && Object.keys(row.macros).every(key=>Math.abs(row.macros[key as keyof typeof row.macros]-actual.macros[key as keyof typeof row.macros])<=1e-6) &&
      Object.keys(row.micros).every(key=>Math.abs(row.micros[key as keyof typeof row.micros]-actual.micros[key as keyof typeof row.micros])<=1e-6);
  });
}
export function isBackupPayload(value: unknown): value is BackupPayloadDto {
  if (!isPlainObject(value) || !exactKeys(value,['formatVersion','createdAt','records','customFoods','favoriteFoodIds','recentFoodIds','personal','photos']) ||
    value.formatVersion!==1 || !isIsoDateTime(value.createdAt) || !isJsonValue(value) || !withoutCredentials(value,true) || !validRecords(value.records) ||
    !isPersonalState(value.personal) || !Array.isArray(value.customFoods) || value.customFoods.length>10000 || !value.customFoods.every(isCustomFood) || !uniqueIds(value.customFoods)) return false;
  if (![value.favoriteFoodIds,value.recentFoodIds].every(rows=>Array.isArray(rows) && rows.length<=10000 && rows.every(safeId) && new Set(rows).size===rows.length) ||
      !Array.isArray(value.recentFoodIds) || value.recentFoodIds.length>12 || !Array.isArray(value.photos) || value.photos.length>1000) return false;
  const photoIds=new Set(value.personal.photos.map(photo=>photo.id));
  let total=0;
  const valid=value.photos.every((photo: unknown)=>{
    if(!isPlainObject(photo) || !exactKeys(photo,['id','bytesBase64']) || !safeId(photo.id) || !photoIds.has(photo.id)) return false;
    const size=base64ByteLength(photo.bytesBase64,MAX_PHOTO_BYTES);
    if(size===null || size===0) return false;
    total+=size;return total<=MAX_PHOTOS_BYTES;
  });
  return valid && value.photos.length===photoIds.size && new Set(value.photos.map(photo=>(photo as BackupPhotoDto).id)).size===photoIds.size;
}
export function isBackupEnvelope(value: unknown): value is BackupEnvelopeDto {
  return isPlainObject(value) && exactKeys(value,['formatVersion','cipher','kdf','iterations','salt','nonce','ciphertext']) && value.formatVersion===1 &&
    value.cipher==='AES-256-GCM' && value.kdf==='PBKDF2-HMAC-SHA256' && value.iterations===BACKUP_ITERATIONS &&
    base64ByteLength(value.salt,16)===16 && base64ByteLength(value.nonce,12)===12 &&
    (base64ByteLength(value.ciphertext)??0)>=16 && JSON.stringify(value).length<=MAX_BACKUP_BYTES;
}
/** Pure preflight: invalid input never changes either the current state or its caller. */
export function preflightRestore(value: unknown): RestorePlan {
  if(!isBackupPayload(value)) throw new BackupValidationError('Invalid or unsupported backup payload');
  const payload=cloneJson(value);
  return {payload,preview:{createdAt:payload.createdAt,recordRevision:payload.records.revision,personalRevision:payload.personal.revision,
    counts:{weights:payload.records.weights.length,water:payload.records.water.length,exercises:payload.records.exercises.length,
      intakeEntries:payload.records.intakeEntries.length,legacyIntake:payload.records.legacyIntake.length,customFoods:payload.customFoods.length,
      measurements:payload.personal.measurements.length,photos:payload.personal.photos.length},
    photoBytes:payload.photos.reduce((sum,photo)=>sum+(base64ByteLength(photo.bytesBase64)??0),0)}};
}
export function checkRestoreRevision(plan:RestorePlan,expected:{recordsRevision:number;personalRevision:number},current:{recordsRevision:number;personalRevision:number}):void {
  if(!isBackupPayload(plan.payload) || !safeRevision(expected.recordsRevision) || !safeRevision(expected.personalRevision) ||
    expected.recordsRevision!==current.recordsRevision || expected.personalRevision!==current.personalRevision) throw new BackupValidationError('Restore preview is stale');
}
function passwordBytes(password:string,codec:BackupJsonPort):Uint8Array {
  const bytes=codec.utf8(password);
  if(bytes.length<12 || bytes.length>1024) throw new BackupValidationError('Passphrase must contain 12–1024 UTF-8 bytes');
  return bytes;
}
export async function encryptBackup(payload:BackupPayloadDto,password:string,crypto:BackupCryptoPort,codec:BackupJsonPort):Promise<BackupEnvelopeDto> {
  const plan=preflightRestore(payload);
  const plaintext=codec.encode(plan.payload);
  if(plaintext.length>MAX_BACKUP_BYTES-16) throw new BackupValidationError('Backup exceeds supported size');
  const secret=passwordBytes(password,codec);
  const salt=await crypto.randomBytes(16),nonce=await crypto.randomBytes(12);
  if(salt.length!==16 || nonce.length!==12) throw new BackupValidationError('Invalid random bytes');
  let key:Uint8Array|null=null;
  try {
    key=await crypto.deriveKey(secret,salt,BACKUP_ITERATIONS);
    if(key.length!==32) throw new BackupValidationError('Invalid key size');
    const ciphertext=await crypto.seal(key,nonce,plaintext,codec.utf8(BACKUP_AAD));
    if(ciphertext.length!==plaintext.length+16 || ciphertext.length>MAX_BACKUP_BYTES) throw new BackupValidationError('Invalid ciphertext size');
    const envelope:BackupEnvelopeDto={formatVersion:1,cipher:'AES-256-GCM',kdf:'PBKDF2-HMAC-SHA256',iterations:BACKUP_ITERATIONS,salt:encodeBase64(salt),nonce:encodeBase64(nonce),ciphertext:encodeBase64(ciphertext)};
    if(!isBackupEnvelope(envelope)) throw new BackupValidationError('Encoded backup exceeds supported size');
    return envelope;
  } finally { secret.fill(0);key?.fill(0);plaintext.fill(0); }
}
/** No restore/write port exists here. Native confirmation must commit atomically after CAS. */
export async function inspectEncryptedBackup(envelope:unknown,password:string,crypto:BackupCryptoPort,codec:BackupJsonPort):Promise<RestorePlan> {
  if(!isBackupEnvelope(envelope)) throw new BackupValidationError('Invalid or unsupported backup envelope');
  const secret=passwordBytes(password,codec);let key:Uint8Array|null=null;let plaintext:Uint8Array|null=null;
  try {
    key=await crypto.deriveKey(secret,decodeBase64(envelope.salt),BACKUP_ITERATIONS);
    if(key.length!==32) throw new BackupValidationError('Invalid key size');
    try { plaintext=await crypto.open(key,decodeBase64(envelope.nonce),decodeBase64(envelope.ciphertext),codec.utf8(BACKUP_AAD)); }
    catch { throw new BackupAuthenticationError('Backup authentication failed'); }
    if(plaintext.length>MAX_BACKUP_BYTES-16) throw new BackupValidationError('Backup exceeds supported size');
    return preflightRestore(codec.decode(plaintext));
  } finally { secret.fill(0);key?.fill(0);plaintext?.fill(0); }
}
