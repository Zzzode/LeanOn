export type DataJsonValue = null | boolean | number | string | DataJsonValue[] | { [key:string]:DataJsonValue };
export function isPlainObject(value: unknown): value is Record<string,unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
export function exactKeys(value:Record<string,unknown>, allowed:readonly string[]):boolean { return Object.keys(value).every(key=>allowed.includes(key)); }
export function finiteRange(value:unknown,min:number,max:number):value is number { return typeof value==='number' && Number.isFinite(value) && value>=min && value<=max; }
export function safeRevision(value:unknown):value is number { return finiteRange(value,0,Number.MAX_SAFE_INTEGER) && Number.isSafeInteger(value); }
export function safeId(value:unknown):value is string { return typeof value==='string' && value.length>0 && value.length<=256 && value.trim()===value && !/[\u0000-\u001f]/.test(value); }
export function uniqueIds(rows:readonly {id:string}[]):boolean { return new Set(rows.map(row=>row.id)).size===rows.length; }
/** Reject cycles, prototypes, unsupported values and excessive nesting before copying. */
export function isJsonValue(value:unknown, depth:number=0, seen:Set<object>=new Set<object>(), budget:{remaining:number}={remaining:500000}):boolean {
  budget.remaining -= 1;
  if (depth>20 || budget.remaining<0) return false;
  if (value===null || typeof value==='boolean' || typeof value==='string') return true;
  if (typeof value==='number') return Number.isFinite(value);
  if (typeof value!=='object' || seen.has(value)) return false;
  seen.add(value);
  const valid=Array.isArray(value) ? value.length<=100000 && value.every(item=>isJsonValue(item,depth+1,seen,budget)) :
    isPlainObject(value) && Object.keys(value).length<=1000 && Object.entries(value).every(([key,item])=>!['__proto__','constructor','prototype'].includes(key) && isJsonValue(item,depth+1,seen,budget));
  seen.delete(value);
  return valid;
}
const CREDENTIAL_KEYS=new Set(['password','passphrase','accesstoken','refreshtoken','sessiontoken','authorization','credentials','privatekey','secretkey','apikey','session','wrappedkey','wrapped','invitesecret','devicesecret','deviceproof','vaultkey','familykey','proof','proofhash','clientsecret','secret','encryptionkey','decryptionkey','datakey','devicekey','accountkeys','familykeys','groupkeys','pendingaccountdeletion','deletionproof','capabilityproof','deletecapability']);
export function withoutCredentials(value:unknown, allowRecordUndoTokens:boolean=false, path:readonly (string|number)[]=[]):boolean {
  if (Array.isArray(value)) return value.every((item,index)=>withoutCredentials(item,allowRecordUndoTokens,[...path,index]));
  if (!isPlainObject(value)) return true;
  return Object.entries(value).every(([key,item])=>{
    const normalized=key.replace(/[-_]/g,'').toLowerCase();
    if(CREDENTIAL_KEYS.has(normalized)) return false;
    if(normalized==='token' || normalized==='undotoken') {
      const receipt=path.length===3 && path[0]==='records' && path[1]==='processedOperations' && typeof path[2]==='number';
      const restoreMutation=path.length===4 && path[0]==='records' && path[1]==='processedOperations' && typeof path[2]==='number' && path[3]==='mutation' && value.type==='restore-record';
      const deletion=path.length===3 && path[0]==='records' && path[1]==='deletedRecords' && typeof path[2]==='number' &&
        typeof value.kind==='string' && ['weight','water','exercise','intake','legacy-intake'].includes(value.kind) && isPlainObject(value.record) && value.deletedAt!==undefined;
      if(!allowRecordUndoTokens || (normalized==='undotoken' ? !receipt : !restoreMutation && !deletion) || typeof item!=='string' || !item.startsWith('undo-')) return false;
    }
    return withoutCredentials(item,allowRecordUndoTokens,[...path,key]);
  });
}
export function cloneJson<T>(value:T):T { return JSON.parse(JSON.stringify(value)) as T; }

/** UTF-8 byte quota without a platform encoder; isolated surrogates encode as replacement bytes. */
export function utf8ByteLength(value: string): number {
  let count = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    count += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return count;
}
