import { expect, test } from '@rstest/core';
import { createLeanOnBridgeClient, createMemoryBridge } from '@zzzode/bridge';
import { createFoodFromBarcode } from '@zzzode/food-data';
import { sampleHostData } from './sample.js';
import { scanFood, lookupBarcodeFood, createBarcodeOperationGate } from './scan-food.js';

const barcode = '0012345678905';
const product = { product_name: 'Scan fixture', nutriments: { 'energy-kcal_100g': 120, proteins_100g: 5, sodium_100g: 0.1 } };
function fixture() {
  const memory = createMemoryBridge();
  const calls: string[] = [];
  memory.handle('scanner.getStatus',()=>({cameraAvailable:true,hostAvailable:true,permission:'authorized'}));
  memory.handle('scanner.scanBarcode', () => { calls.push('scan'); return { barcode }; });
  memory.handle('food.lookupProduct', () => { calls.push('lookup'); return { found: true, product }; });
  memory.handle('health.writeScannedFood', () => {
    calls.push('write');
    return { success: true, hostData: { ...sampleHostData, customFoods: [createFoodFromBarcode(barcode, product)] } };
  });
  return { memory, calls, bridge: createLeanOnBridgeClient(memory.transport) };
}

test('camera unavailable and denied permissions stop before lookup or persistence', async () => {
  for (const [code, expected] of [['unavailable', 'cameraUnavailable'], ['not-authorized', 'cameraPermission']]) {
    const { memory, calls, bridge } = fixture();
    memory.handle('scanner.scanBarcode', () => { calls.push('scan'); throw { code, message: 'Camera failure' }; });
    expect(await scanFood(bridge, [])).toEqual({ kind: 'error', error: expected });
    expect(calls).toEqual(['scan']);
  }
});

test('cancelling either through a result or native error never queries or writes', async () => {
  for (const cancellation of ['result', 'error']) {
    const { memory, calls, bridge } = fixture();
    memory.handle('scanner.scanBarcode', () => {
      calls.push('scan');
      if (cancellation === 'error') throw { code: 'cancelled', message: 'Cancelled' };
      return { cancelled: true };
    });
    expect(await scanFood(bridge, [])).toEqual({ kind: 'cancelled' });
    expect(calls).toEqual(['scan']);
  }
});

test('a known imported barcode reopens its detail without redundant network or storage calls', async () => {
  const { calls, bridge } = fixture();
  expect(await scanFood(bridge, [`off-${barcode}`])).toEqual({ kind: 'existing', foodId: `off-${barcode}` });
  expect(calls).toEqual(['scan']);
});

test('lookup offline, missing product and missing energy are distinct and never write', async () => {
  for (const expected of ['lookupUnavailable', 'notFound', 'noEnergy']) {
    const { memory, calls, bridge } = fixture();
    memory.handle('food.lookupProduct', () => {
      calls.push('lookup');
      if (expected === 'lookupUnavailable') throw new Error('Offline');
      return expected === 'notFound' ? { found: false } : { found: true, product: { product_name: 'No nutrients' } };
    });
    expect(await scanFood(bridge, [])).toEqual({ kind: 'error', error: expected, barcode });
    expect(calls).toEqual(['scan', 'lookup']);
  }
});

test('a failed persistence response is a save error rather than an OFF connection error', async () => {
  const { memory, calls, bridge } = fixture();
  memory.handle('health.writeScannedFood', () => { calls.push('write'); throw new Error('Disk unavailable'); });
  expect(await scanFood(bridge, [])).toEqual({ kind: 'error', error: 'persistFailed', barcode });
  expect(calls).toEqual(['scan', 'lookup', 'write']);
});

test('only a valid persisted snapshot opens the scanned food, with nutrition preserved', async () => {
  const { memory, calls, bridge } = fixture();
  const result = await scanFood(bridge, []);
  expect(result.kind).toBe('saved');
  if (result.kind !== 'saved') throw new Error('Fixture not saved');
  expect(result.hostData.customFoods[0]?.micros.sodiumMg).toBe(100);
  expect(calls).toEqual(['scan', 'lookup', 'write']);
  memory.handle('health.writeScannedFood', () => ({ success: true, hostData: {} }));
  expect(await scanFood(bridge, [])).toEqual({ kind: 'error', error: 'persistFailed', barcode });
});


test('read-only status blocks camera launch until availability and explicit permission consent are known',async()=>{
  for (const [status,error] of [
    [{cameraAvailable:false,hostAvailable:true,permission:'not-determined'},'cameraUnavailable'],
    [{cameraAvailable:true,hostAvailable:false,permission:'authorized'},'hostMissing'],
    [{cameraAvailable:true,hostAvailable:true,permission:'not-determined'},'permissionNotRequested'],
    [{cameraAvailable:true,hostAvailable:true,permission:'denied'},'cameraPermission'],
    [{cameraAvailable:true,hostAvailable:true,permission:'restricted'},'cameraRestricted'],
  ] as const) {
    const {memory,calls,bridge}=fixture();memory.handle('scanner.getStatus',()=>status);
    expect(await scanFood(bridge,[])).toEqual({kind:'error',error});expect(calls).toEqual([]);
  }
  const {memory,calls,bridge}=fixture();memory.handle('scanner.getStatus',()=>({cameraAvailable:true,hostAvailable:true,permission:'not-determined'}));
  expect((await scanFood(bridge,[],{allowPermissionRequest:true})).kind).toBe('saved');expect(calls).toEqual(['scan','lookup','write']);
});

test('manual invalid GTIN never reaches camera, network, or persistence',async()=>{
  for(const invalid of ['123','4006381333932','4006 381333931','4006381333931-']){
    const {bridge,calls}=fixture();expect(await lookupBarcodeFood(bridge,invalid,[])).toEqual({kind:'error',error:'invalidBarcode'});expect(calls).toEqual([]);
  }
  const {bridge,calls}=fixture();expect((await lookupBarcodeFood(bridge,barcode,[])).kind).toBe('saved');expect(calls).toEqual(['lookup','write']);
});

test('UPC-A reuses a legacy imported ID without changing food or record identity',async()=>{
  const {bridge,calls}=fixture();
  expect(await lookupBarcodeFood(bridge,'036000291452',['off-036000291452'])).toEqual({kind:'existing',foodId:'off-036000291452'});
  expect(await lookupBarcodeFood(bridge,'0036000291452',['off-036000291452'])).toEqual({kind:'existing',foodId:'off-036000291452'});
  expect(calls).toEqual([]);
});

test('native timeout, offline, invalid response and missing host lookup have actionable distinct failures',async()=>{
  for(const [failure,error] of [
    [{code:'unavailable',message:'timeout',details:{reason:'timeout'}},'lookupTimeout'],
    [{code:'unavailable',message:'offline',details:{reason:'offline'}},'lookupOffline'],
    [{code:'unavailable',message:'bad response',details:{reason:'service-response'}},'lookupResponseError'],
    [{code:'method-not-found',message:'old host'},'lookupUnsupported'],
  ] as const){
    const {memory,bridge,calls}=fixture();memory.handle('food.lookupProduct',()=>{calls.push('lookup');throw failure;});
    expect(await lookupBarcodeFood(bridge,barcode,[])).toEqual({kind:'error',error,barcode});expect(calls).toEqual(['lookup']);
  }
});

test('a lookup deadline rejects a late service result without importing it',async()=>{
  const {memory,bridge,calls}=fixture();let complete:((value:{found:true;product:typeof product})=>void)|undefined;
  memory.handle('food.lookupProduct',()=>{calls.push('lookup');return new Promise(resolve=>{complete=resolve;});});
  expect(await lookupBarcodeFood(bridge,barcode,[],{timeoutMs:5})).toEqual({kind:'error',error:'lookupTimeout',barcode});
  complete?.({found:true,product});await Promise.resolve();expect(calls).toEqual(['lookup']);
});

test('closing during lookup prevents import and a later manual retry can use the same barcode',async()=>{
  const {memory,bridge,calls}=fixture();let cancelled=false;let complete:((value:{found:true;product:typeof product})=>void)|undefined;
  memory.handle('food.lookupProduct',()=>{calls.push('lookup');return new Promise(resolve=>{complete=resolve;});});
  const pending=lookupBarcodeFood(bridge,barcode,[],{isCancelled:()=>cancelled});
  await Promise.resolve();cancelled=true;complete?.({found:true,product});
  expect(await pending).toEqual({kind:'cancelled'});expect(calls).toEqual(['lookup']);
  memory.handle('food.lookupProduct',()=>{calls.push('lookup');return {found:true,product};});
  expect((await lookupBarcodeFood(bridge,barcode,[])).kind).toBe('saved');expect(calls).toEqual(['lookup','lookup','write']);
});

test('volume-based nutrition is not imported as per100g',async()=>{
  const {memory,bridge,calls}=fixture();memory.handle('food.lookupProduct',()=>{calls.push('lookup');return {found:true,product:{...product,product_quantity_unit:'ml'}};});
  expect(await lookupBarcodeFood(bridge,barcode,[])).toEqual({kind:'error',error:'nutritionUnit',barcode});expect(calls).toEqual(['lookup']);
});

test('query failure keeps the barcode for a retry and exposes import as a separate locked phase',async()=>{
  const {memory,bridge,calls}=fixture();memory.handle('food.lookupProduct',()=>{calls.push('lookup');return {found:false};});
  expect(await lookupBarcodeFood(bridge,barcode,[])).toEqual({kind:'error',error:'notFound',barcode});
  memory.handle('food.lookupProduct',()=>{calls.push('lookup');return {found:true,product};});
  const phases:string[]=[];expect((await lookupBarcodeFood(bridge,barcode,[],{onPhase:phase=>phases.push(phase)})).kind).toBe('saved');
  expect(phases).toEqual(['lookup','importing']);expect(calls).toEqual(['lookup','lookup','write']);
});


test('cancelled pending lookup allows a new lookup immediately and its late result cannot release the new import lock',async()=>{
  const {memory,bridge,calls}=fixture();const gate=createBarcodeOperationGate();let cancelled=false;
  let completeOld:((value:{found:true;product:typeof product})=>void)|undefined;
  let completeWrite:((value:{success:true;hostData:typeof sampleHostData})=>void)|undefined;
  memory.handle('food.lookupProduct',()=>{calls.push('lookup-old');return new Promise(resolve=>{completeOld=resolve;});});
  const old=gate.begin(()=>cancelled);if(old===null)throw new Error('Initial read blocked');
  const pendingOld=lookupBarcodeFood(bridge,barcode,[],{isCancelled:()=>cancelled,onPhase:old.onPhase}).finally(old.finish);
  await Promise.resolve();cancelled=true;
  const next=gate.begin(()=>false);if(next===null)throw new Error('Cancelled read blocked a new read');
  memory.handle('food.lookupProduct',()=>{calls.push('lookup-new');return {found:true,product};});
  memory.handle('health.writeScannedFood',()=>{calls.push('write-new');return new Promise(resolve=>{completeWrite=resolve;});});
  const pendingNew=lookupBarcodeFood(bridge,barcode,[],{onPhase:next.onPhase}).finally(next.finish);
  for(let index=0;index<12&&!gate.importing;index++)await Promise.resolve();
  expect(gate.importing).toBe(true);expect(gate.begin(()=>true)).toBeNull();
  completeOld?.({found:true,product});expect(await pendingOld).toEqual({kind:'cancelled'});
  expect(gate.importing).toBe(true);
  completeWrite?.({success:true,hostData:{...sampleHostData,customFoods:[createFoodFromBarcode(barcode,product)]}});
  expect((await pendingNew).kind).toBe('saved');expect(gate.importing).toBe(false);
  expect(calls).toEqual(['lookup-old','lookup-new','write-new']);
});

test('closing during read-only status prevents a later camera launch',async()=>{
  const {memory,bridge,calls}=fixture();let cancelled=false;let complete:((status:{cameraAvailable:true;hostAvailable:true;permission:'authorized'})=>void)|undefined;
  memory.handle('scanner.getStatus',()=>new Promise(resolve=>{complete=resolve;}));
  const pending=scanFood(bridge,[],{isCancelled:()=>cancelled});await Promise.resolve();cancelled=true;
  complete?.({cameraAvailable:true,hostAvailable:true,permission:'authorized'});
  expect(await pending).toEqual({kind:'cancelled'});expect(calls).toEqual([]);
});
