export type RememberModalInvoker=(id:string,insideSheet:boolean)=>void;
export type ScheduleFocusReturn=(callback:()=>void)=>()=>void;

/** Sheet actions do not replace the original invoker; delayed returns cannot steal focus from a reopened modal. */
export function createModalFocusReturnController() {
  let invoker:string|null=null;let active=false;let generation=0;
  return {
    remember:((id,insideSheet)=>{if(!insideSheet)invoker=id;}) as RememberModalInvoker,
    opened(){active=true;generation+=1;},
    clear(){invoker=null;generation+=1;},
    closed(requestFocus:(id:string,isCurrent:()=>boolean)=>void,schedule:ScheduleFocusReturn):()=>void {
      if(!active)return ()=>{};
      active=false;const target=invoker;invoker=null;const requestGeneration=++generation;
      if(target===null)return ()=>{};
      const isCurrent=()=>!active&&generation===requestGeneration;
      return schedule(()=>{if(isCurrent())requestFocus(target,isCurrent);});
    },
  };
}

/** Focus follows native scroll settlement, with a guarded best effort fallback if scrolling fails. */
export function focusVisibleModalInvoker(id:string,isCurrent:()=>boolean,reveal:(id:string,onRevealed:()=>void)=>void,requestFocus:(id:string)=>void):void {
  if(!isCurrent())return;
  reveal(id,()=>{if(isCurrent())requestFocus(id);});
}
