import {expect,test} from '@rstest/core';
import {createModalFocusReturnController,focusVisibleModalInvoker} from './modal-focus.js';
test('Cancel and Save return to the original focused invoker, rather than the last action or page title',()=>{
  for(const action of ['cancel','save']){
    const controller=createModalFocusReturnController();const restored:string[]=[];const scheduled:Array<()=>void>=[];
    controller.remember('me-dietary-button',false);controller.opened();
    controller.remember('sheet-choice',true);controller.remember(action,true);
    controller.closed(id=>restored.push(id),callback=>{scheduled.push(callback);return ()=>{};});
    expect(restored).toEqual([]);scheduled[0]!();expect(restored).toEqual(['me-dietary-button']);
  }
});
test('reopening a modal suppresses the previous delayed return and preserves the new invoker',()=>{
  const controller=createModalFocusReturnController();const restored:string[]=[];const scheduled:Array<()=>void>=[];
  const schedule=(callback:()=>void)=>{scheduled.push(callback);return ()=>{};};
  controller.remember('photos-button',false);controller.opened();controller.closed(id=>restored.push(id),schedule);
  controller.remember('dietary-button',false);controller.opened();scheduled[0]!();expect(restored).toEqual([]);
  controller.closed(id=>restored.push(id),schedule);scheduled[1]!();expect(restored).toEqual(['dietary-button']);
});
test('initial render and changed routes do not request stale or absent invoker focus',()=>{
  const controller=createModalFocusReturnController();const restored:string[]=[];let scheduled:(()=>void)|undefined;
  const schedule=(callback:()=>void)=>{scheduled=callback;return ()=>{};};
  controller.closed(id=>restored.push(id),schedule);expect(scheduled).toBeUndefined();
  controller.remember('old-route-button',false);controller.opened();controller.closed(id=>restored.push(id),schedule);controller.clear();
  scheduled!();expect(restored).toEqual([]);
});

test('an offscreen invoker is revealed before focus, and late native scroll replies cannot steal focus from another modal',()=>{
  const controller=createModalFocusReturnController();const events:string[]=[];let revealed:(()=>void)|undefined;
  const restore=(id:string,isCurrent:()=>boolean)=>focusVisibleModalInvoker(id,isCurrent,(target,onRevealed)=>{events.push(`reveal:${target}`);revealed=onRevealed;},target=>events.push(`focus:${target}`));
  const immediately=(callback:()=>void)=>{callback();return ()=>{};};
  controller.remember('dietary-button',false);controller.opened();controller.closed(restore,immediately);
  expect(events).toEqual(['reveal:dietary-button']);revealed!();expect(events).toEqual(['reveal:dietary-button','focus:dietary-button']);
  controller.remember('photos-button',false);controller.opened();controller.closed(restore,immediately);
  controller.remember('backup-button',false);controller.opened();revealed!();
  expect(events).toEqual(['reveal:dietary-button','focus:dietary-button','reveal:photos-button']);
});
