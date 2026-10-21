import { describe, expect, it } from '@rstest/core';
import { createEmptyRecordsState, applyRecordMutation, projectIntake } from '@zzzode/core';
import { BACKUP_AAD, BACKUP_ITERATIONS, MAX_PHOTO_BYTES, BackupAuthenticationError, checkRestoreRevision, decodeBase64, encodeBase64, encryptBackup, inspectEncryptedBackup, isBackupEnvelope, isBackupPayload, preflightRestore } from './backup.js';
import type { BackupCryptoPort, BackupEnvelopeDto, BackupJsonPort, BackupPayloadDto } from './backup.js';
import { applyPersonalMutation, createEmptyPersonalState } from './personal.js';
function fixture():BackupPayloadDto{return {formatVersion:1,createdAt:'2026-10-07T10:00:00Z',records:createEmptyRecordsState(),customFoods:[],favoriteFoodIds:[],recentFoodIds:[],personal:createEmptyPersonalState(),photos:[]};}
// Test-only port stand-in: these tests verify orchestration, not cryptographic primitives.
const codec:BackupJsonPort={
  utf8(value){const bytes:number[]=[];for(const char of value){const c=char.codePointAt(0)!;if(c<128)bytes.push(c);else if(c<2048)bytes.push(192|(c>>6),128|(c&63));else if(c<65536)bytes.push(224|(c>>12),128|((c>>6)&63),128|(c&63));else bytes.push(240|(c>>18),128|((c>>12)&63),128|((c>>6)&63),128|(c&63));}return Uint8Array.from(bytes);},
  encode(value){return this.utf8(JSON.stringify(value));},
  decode(bytes){let text='';for(let i=0;i<bytes.length;){const a=bytes[i++]!;if(a<128)text+=String.fromCodePoint(a);else if(a<224)text+=String.fromCodePoint(((a&31)<<6)|(bytes[i++]!&63));else if(a<240)text+=String.fromCodePoint(((a&15)<<12)|((bytes[i++]!&63)<<6)|(bytes[i++]!&63));else text+=String.fromCodePoint(((a&7)<<18)|((bytes[i++]!&63)<<12)|((bytes[i++]!&63)<<6)|(bytes[i++]!&63));}return JSON.parse(text) as unknown;}
};
function port(events:string[]):BackupCryptoPort{return {
  async randomBytes(length){return new Uint8Array(length).fill(length);},
  async deriveKey(password,salt,iterations){expect(iterations).toBe(BACKUP_ITERATIONS);expect(salt.length).toBe(16);events.push('derive');const key=new Uint8Array(32);for(const b of password)key[0]=(key[0]!+b)&255;return key;},
  async seal(key,nonce,plaintext,aad){expect(nonce.length).toBe(12);expect(aad).toEqual(codec.utf8(BACKUP_AAD));events.push('seal');const out=new Uint8Array(plaintext.length+16);out.set(plaintext);let sum=key[0]!;for(const b of plaintext)sum=(sum+b)&255;out.fill(sum,plaintext.length);return out;},
  async open(key,nonce,ciphertext,aad){expect(nonce.length).toBe(12);expect(aad).toEqual(codec.utf8(BACKUP_AAD));events.push('open');const plaintext=ciphertext.slice(0,-16);let sum=key[0]!;for(const b of plaintext)sum=(sum+b)&255;if(!ciphertext.slice(-16).every(b=>b===sum))throw new Error('Authentication failed');return plaintext;}
};}
describe('portable encrypted backup preflight',()=>{
  it('round trips exact persisted JPEG bytes, preferences, receipts and custom food lists',async()=>{
    const payload=fixture();payload.personal.dietaryPreferences['future']={notes:'中文 · keep'};
    payload.personal=applyPersonalMutation(payload.personal,{operationId:'photo-import',expectedRevision:0,mutation:{type:'add-photo',photo:{id:'p-1',date:'2026-10-07',view:'front',createdAt:payload.createdAt,mime:'image/jpeg',width:320,height:480}}}).personal;
    payload.customFoods=[{id:'custom-rice',name:{en:'Fixture rice','zh-CN':'测试米饭'},kcal:130,macros:{proteinG:2.7,carbsG:28,fatG:0.3},micros:{fiberG:0.4,sugarG:0.1,saturatedFatG:0.1,sodiumMg:1},defaultGrams:200,source:'custom'}];
    const bytes=Uint8Array.from([255,216,0,1,128,255,217]);payload.photos=[{id:'p-1',bytesBase64:encodeBase64(bytes)}];
    payload.favoriteFoodIds=['custom-rice'];payload.recentFoodIds=['custom-rice'];
    const envelope=await encryptBackup(payload,'long enough passphrase',port([]),codec);
    const plan=await inspectEncryptedBackup(envelope,'long enough passphrase',port([]),codec);
    expect(plan.payload).toEqual(payload);expect(decodeBase64(plan.payload.photos[0]!.bytesBase64)).toEqual(bytes);expect(plan.preview.photoBytes).toBe(7);
  });
  it('never decodes payload after password or ciphertext authentication failure',async()=>{
    const envelope=await encryptBackup(fixture(),'password long enough',port([]),codec);let decoded=false;
    const guarded={...codec,decode(bytes:Uint8Array){decoded=true;return codec.decode(bytes);}};
    await expect(inspectEncryptedBackup(envelope,'other password enough',port([]),guarded)).rejects.toBeInstanceOf(BackupAuthenticationError);expect(decoded).toBe(false);
    const changed=decodeBase64(envelope.ciphertext);changed[0]=changed[0]!^1;
    await expect(inspectEncryptedBackup({...envelope,ciphertext:encodeBase64(changed)},'password long enough',port([]),guarded)).rejects.toThrow();expect(decoded).toBe(false);
  });
  it('rejects unsupported or oversized parameters before invoking crypto',async()=>{
    const envelope:BackupEnvelopeDto={formatVersion:1,cipher:'AES-256-GCM',kdf:'PBKDF2-HMAC-SHA256',iterations:600000,salt:encodeBase64(new Uint8Array(16)),nonce:encodeBase64(new Uint8Array(12)),ciphertext:encodeBase64(new Uint8Array(16))};
    expect(isBackupEnvelope({...envelope,iterations:1})).toBe(false);expect(isBackupEnvelope({...envelope,formatVersion:2})).toBe(false);expect(isBackupEnvelope({...envelope,nonce:'AA=='})).toBe(false);
    expect(()=>decodeBase64('AB==')).toThrow();const events:string[]=[];await expect(inspectEncryptedBackup({...envelope,iterations:1},'long enough password',port(events),codec)).rejects.toThrow();expect(events).toEqual([]);
  });
  it('rejects duplicate IDs/dates, negative nutrition, future schema and mismatched aggregates',()=>{
    const duplicate=fixture();duplicate.records.weights=[{id:'w',date:'2026-10-01',weightKg:80},{id:'w',date:'2026-10-02',weightKg:79}];expect(isBackupPayload(duplicate)).toBe(false);
    const invalid=fixture();invalid.records.intake=[{date:'2026-10-01',kcal:100,macros:{proteinG:0,carbsG:0,fatG:0},micros:{fiberG:0,sugarG:0,saturatedFatG:0,sodiumMg:0}}];expect(isBackupPayload(invalid)).toBe(false);
    expect(isBackupPayload({...fixture(),formatVersion:2})).toBe(false);expect(isBackupPayload({...fixture(),session:{token:'never export'}})).toBe(false);
    const bad=fixture();bad.personal.dietaryPreferences['future']={deviceSecret:'never export'};expect(isBackupPayload(bad)).toBe(false);
  });
  it('preserves durable record undo tokens but excludes authentication tokens',()=>{
    const payload=fixture();const clock={today:'2026-10-07',deletedAt:payload.createdAt};
    payload.records=applyRecordMutation(payload.records,{operationId:'w',expectedRevision:0,mutation:{type:'set-weight',date:'2026-10-07',weightKg:80}},clock).state;
    payload.records=applyRecordMutation(payload.records,{operationId:'d',expectedRevision:1,mutation:{type:'delete-record',kind:'weight',id:payload.records.weights[0]!.id}},clock).state;
    expect(isBackupPayload(payload)).toBe(true);expect(preflightRestore(payload).payload.records.deletedRecords[0]?.token).toBe('undo-d');
  });
  it('does not mistake nested metadata for an authorized record-undo path',()=>{
    const payload=fixture();
    payload.records.weights=[Object.assign({id:'w',date:'2026-10-07',weightKg:80},{future:{type:'restore-record',token:'undo-disguised-credential'}})];
    expect(isBackupPayload(payload)).toBe(false);
    const personal=fixture();personal.personal.dietaryPreferences['future']={deviceProof:'never export'};
    expect(isBackupPayload(personal)).toBe(false);
  });
  it('requires each photograph exactly once and rejects missing, duplicate or noncanonical bytes',()=>{
    const payload=fixture();payload.personal.photos=[{id:'p',date:'2026-10-07',view:'front',createdAt:payload.createdAt,mime:'image/jpeg',width:10,height:10}];expect(isBackupPayload(payload)).toBe(false);
    payload.photos=[{id:'p',bytesBase64:'AB=='}];expect(isBackupPayload(payload)).toBe(false);payload.photos=[{id:'p',bytesBase64:'AA=='},{id:'p',bytesBase64:'AA=='}];expect(isBackupPayload(payload)).toBe(false);
  });
  it('does not mutate existing state or backup during failed preflight or stale CAS',()=>{
    const existing=fixture();const before=JSON.stringify(existing);const corrupt={...existing,personal:{...existing.personal,version:2}};
    expect(()=>preflightRestore(corrupt)).toThrow();expect(JSON.stringify(existing)).toBe(before);
    const plan=preflightRestore(existing);expect(()=>checkRestoreRevision(plan,{recordsRevision:0,personalRevision:0},{recordsRevision:1,personalRevision:0})).toThrow();
    plan.payload.personal.dietaryPreferences.notes='Edited returned copy';expect(JSON.stringify(existing)).toBe(before);
  });
  it('keeps valid same-date legacy aggregates and kind-scoped identities without new nutrient caps',()=>{
    const payload=fixture();const macros={proteinG:0,carbsG:0,fatG:0};const micros={fiberG:0,sugarG:0,saturatedFatG:0,sodiumMg:0};
    payload.records.legacyIntake=[{id:'l1',date:'2026-10-01',kcal:1000001,macros,micros},{id:'l2',date:'2026-10-01',kcal:2,macros,micros}];
    payload.records.intake=projectIntake(payload.records.legacyIntake,[]);
    payload.records.weights=[{id:'shared-kind-id',date:'2026-10-01',weightKg:80}];payload.records.water=[{id:'shared-kind-id',date:'2026-10-01',amountMl:1000001}];
    expect(isBackupPayload(payload)).toBe(true);expect(preflightRestore(payload).payload.records.legacyIntake).toHaveLength(2);
    payload.records.legacyIntake[0]!.macros={...macros,proteinG:-1};expect(isBackupPayload(payload)).toBe(false);
  });
  it('rejects an oversized JPEG before any decoding or copying of bytes',()=>{
    const payload=fixture();payload.personal.photos=[{id:'p',date:'2026-10-07',view:'front',createdAt:payload.createdAt,mime:'image/jpeg',width:10,height:10}];
    payload.photos=[{id:'p',bytesBase64:'A'.repeat(Math.ceil(MAX_PHOTO_BYTES/3)*4+4)}];expect(isBackupPayload(payload)).toBe(false);
  });
  it('uses exact UTF-8 bytes with no Unicode normalization',async()=>{
    const events:string[]=[];const crypto=port(events);let captured:Uint8Array|undefined;const derive=crypto.deriveKey;
    crypto.deriveKey=async(password,salt,iterations)=>{captured=password.slice();return derive(password,salt,iterations);};
    await encryptBackup(fixture(),'伙伴密码🔒 e\u0301',crypto,codec);expect(captured).toEqual(codec.utf8('伙伴密码🔒 e\u0301'));expect(captured).not.toEqual(codec.utf8('伙伴密码🔒 é'));
  });
});
