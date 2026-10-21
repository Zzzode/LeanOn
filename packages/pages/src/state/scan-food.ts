import { isScannerStatus, type LeanOnBridgeClient, type LeanOnRpcContract, type ScannerStatus } from '@zzzode/bridge';
import { createFoodFromBarcode, normalizeProductBarcode } from '@zzzode/food-data';
import { readHostDataEnvelope } from './host-data.js';
import type { HostData } from './types.js';

export type ScanFoodPhase = 'checking' | 'scanning' | 'lookup' | 'importing';
export type ScanFoodError = 'cameraUnavailable' | 'cameraPermission' | 'permissionNotRequested' | 'cameraRestricted' | 'hostMissing' | 'scannerUnsupported'
  | 'invalidBarcode' | 'lookupUnavailable' | 'lookupOffline' | 'lookupResponseError' | 'lookupUnsupported' | 'lookupTimeout' | 'notFound' | 'noEnergy' | 'nutritionUnit' | 'persistFailed';
export type ScanFoodResult =
  | { kind: 'cancelled' }
  | { kind: 'error'; error: ScanFoodError; barcode?: string }
  | { kind: 'existing'; foodId: string }
  | { kind: 'saved'; foodId: string; hostData: HostData };
interface ScanOptions { allowPermissionRequest?: boolean; onPhase?: (phase: ScanFoodPhase) => void; timeoutMs?: number; isCancelled?: () => boolean }
function errorCode(value: unknown): unknown {
  return typeof value === 'object' && value !== null && 'code' in value ? value.code : undefined;
}
function errorReason(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  if ('reason' in value) return value.reason;
  if ('details' in value && typeof value.details === 'object' && value.details !== null && 'reason' in value.details) return value.details.reason;
  return undefined;
}
export async function fetchScannerStatus(bridge: LeanOnBridgeClient): Promise<ScannerStatus> {
  const result = await bridge.invoke('scanner.getStatus');
  if (!isScannerStatus(result)) throw new Error('Invalid scanner status');
  return result;
}
/** Read-only lookup has a deadline; a late result cannot reach the persistence stage. */
async function lookupWithDeadline(bridge: LeanOnBridgeClient, barcode: string, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      bridge.invoke('food.lookupProduct', { barcode }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject({code:'lookup-timeout'}), timeoutMs); }),
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

/** Manual barcode lookup never invokes the camera or a permission API. */
export async function lookupBarcodeFood(bridge: LeanOnBridgeClient, input: string, existingFoodIds: readonly string[], options: ScanOptions = {}): Promise<ScanFoodResult> {
  if(options.isCancelled?.())return {kind:'cancelled'};
  const barcode = normalizeProductBarcode(input);
  if (barcode === null) return {kind:'error',error:'invalidBarcode'};
  const foodId = `off-${barcode}`;
  const existing = [foodId, `off-${input.trim()}`, ...(barcode.length===13&&barcode.startsWith('0')?[`off-${barcode.slice(1)}`]:[])].find(id => existingFoodIds.includes(id));
  if (existing !== undefined) return {kind:'existing',foodId:existing};
  options.onPhase?.('lookup');
  let lookup: LeanOnRpcContract['food.lookupProduct']['response'];
  try { lookup = await lookupWithDeadline(bridge, barcode, options.timeoutMs ?? 15_000); }
  catch (error) {
    const code=errorCode(error);const reason=errorReason(error);
    const failure:ScanFoodError=code==='method-not-found'?'lookupUnsupported':code==='lookup-timeout'||reason==='timeout'?'lookupTimeout':reason==='offline'?'lookupOffline':reason==='service-response'?'lookupResponseError':'lookupUnavailable';
    return {kind:'error',error:failure,barcode};
  }
  if (lookup === null || typeof lookup !== 'object') return {kind:'error',error:'lookupResponseError',barcode};
  if (lookup.found === false) return {kind:'error',error:'notFound',barcode};
  if (lookup.found !== true || lookup.product === null || typeof lookup.product !== 'object' || Array.isArray(lookup.product)) return {kind:'error',error:'lookupResponseError',barcode};
  let item;
  try { item = createFoodFromBarcode(barcode, lookup.product); }
  catch (error) { return {kind:'error',error:errorReason(error)==='volume-basis' ? 'nutritionUnit':'noEnergy',barcode}; }
  if(options.isCancelled?.())return {kind:'cancelled'};
  options.onPhase?.('importing');
  try {
    const response = await bridge.invoke('health.writeScannedFood', {
      barcode, name:item.name.en, kcal:item.kcal,
      proteinG:item.macros.proteinG, carbsG:item.macros.carbsG, fatG:item.macros.fatG,
      fiberG:item.micros.fiberG, sugarG:item.micros.sugarG,
      saturatedFatG:item.micros.saturatedFatG, sodiumMg:item.micros.sodiumMg,
      ...(item.defaultGrams === undefined ? {} : {defaultGrams:item.defaultGrams}),
    });
    const hostData = readHostDataEnvelope(response);
    if (response?.success !== true || hostData === null || !hostData.customFoods.some(food=>food.id===foodId)) return {kind:'error',error:'persistFailed',barcode};
    return {kind:'saved',foodId,hostData};
  } catch { return {kind:'error',error:'persistFailed',barcode}; }
}

/** Camera launch requires known native availability and a deliberate permission choice. */
export async function scanFood(bridge: LeanOnBridgeClient, existingFoodIds: readonly string[], options: ScanOptions = {}): Promise<ScanFoodResult> {
  options.onPhase?.('checking');
  let status: ScannerStatus;
  try { status = await fetchScannerStatus(bridge); }
  catch (error) { return {kind:'error',error:errorCode(error)==='method-not-found'?'scannerUnsupported':'cameraUnavailable'}; }
  if(options.isCancelled?.())return {kind:'cancelled'};
  if (!status.hostAvailable) return {kind:'error',error:'hostMissing'};
  if (!status.cameraAvailable) return {kind:'error',error:'cameraUnavailable'};
  if (status.permission==='restricted') return {kind:'error',error:'cameraRestricted'};
  if (status.permission==='denied') return {kind:'error',error:'cameraPermission'};
  if (status.permission==='not-determined' && options.allowPermissionRequest!==true) return {kind:'error',error:'permissionNotRequested'};
  options.onPhase?.('scanning');
  let scan: LeanOnRpcContract['scanner.scanBarcode']['response'];
  try { scan = await bridge.invoke('scanner.scanBarcode'); }
  catch (error) {
    const code=errorCode(error);
    if (code==='cancelled') return {kind:'cancelled'};
    return {kind:'error',error:code==='not-authorized'?'cameraPermission':code==='method-not-found'?'scannerUnsupported':errorReason(error)==='host-missing'?'hostMissing':'cameraUnavailable'};
  }
  if (scan===null||typeof scan!=='object') return {kind:'error',error:'cameraUnavailable'};
  if ('cancelled' in scan && scan.cancelled===true) return {kind:'cancelled'};
  if (!('barcode' in scan) || typeof scan.barcode!=='string') return {kind:'error',error:'invalidBarcode'};
  if(options.isCancelled?.())return {kind:'cancelled'};
  return lookupBarcodeFood(bridge,scan.barcode,existingFoodIds,options);
}


/** Cancelled reads may overlap a new read; an in-flight persistent import may not. */
export function createBarcodeOperationGate() {
  let active: (() => boolean) | null = null;
  let importing = false;
  return {
    get importing() {return importing;},
    begin(cancelled: () => boolean) {
      if(importing || (active !== null && !active()))return null;
      active = cancelled;
      return {
        onPhase(phase: ScanFoodPhase) {if(active === cancelled)importing=phase==='importing';},
        finish() {if(active===cancelled){active=null;importing=false;}},
      };
    },
  };
}
