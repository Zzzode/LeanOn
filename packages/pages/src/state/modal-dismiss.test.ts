import { expect, test } from '@rstest/core';
import { createLeanOnBridgeClient, createMemoryBridge } from '@zzzode/bridge';
import { createModalDismissController } from './modal-dismiss.js';

test('one native Back closes only the barcode child and preserves the food search and pinned draft', () => {
  const memory=createMemoryBridge();const bridge=createLeanOnBridgeClient(memory.transport);
  const dismiss=createModalDismissController();let barcodeOpen=true;let query='rice';
  const draft={date:'2026-10-03',operationId:'pinned-meal'};let activeDraft:typeof draft|null=draft;
  const unregister=dismiss.register(()=>{barcodeOpen=false;});
  const unsubscribe=bridge.subscribe('app.dismissModal',()=>dismiss.dismiss(false,()=>{query='';activeDraft=null;}));
  memory.emit('app.dismissModal',{});
  expect(barcodeOpen).toBe(false);expect(query).toBe('rice');expect(activeDraft).toBe(draft);
  unregister();memory.emit('app.dismissModal',{});
  expect(activeDraft).toBeNull();expect(query).toBe('');unsubscribe();
});

test('a persistent import blocks both child and parent dismissal; stale cleanup cannot remove a new child',()=>{
  const dismiss=createModalDismissController();const calls:string[]=[];
  const staleCleanup=dismiss.register(()=>calls.push('stale'));
  const cleanup=dismiss.register(()=>calls.push('current'));staleCleanup();
  expect(dismiss.dismiss(true,()=>calls.push('outer'))).toBe('blocked');expect(calls).toEqual([]);
  expect(dismiss.dismiss(false,()=>calls.push('outer'))).toBe('inner');expect(calls).toEqual(['current']);
  cleanup();expect(dismiss.dismiss(false,()=>calls.push('outer'))).toBe('outer');expect(calls).toEqual(['current','outer']);
});

test('closing a nested confirmation restores its parent Back action without discarding the parent draft',()=>{
  const controller=createModalDismissController();const actions:string[]=[];
  const parent=controller.register(()=>actions.push('parent'));
  const child=controller.register(()=>actions.push('review'));
  controller.dismiss(false,()=>actions.push('outer'));child();
  controller.dismiss(false,()=>actions.push('outer'));parent();
  controller.dismiss(false,()=>actions.push('outer'));expect(actions).toEqual(['review','parent','outer']);
});
