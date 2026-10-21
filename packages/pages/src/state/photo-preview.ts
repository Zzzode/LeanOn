export interface PhotoPreviewLifecycle {own:number;partner:number;paused:boolean}
export const initialPhotoPreviewLifecycle:PhotoPreviewLifecycle={own:0,partner:0,paused:false};
function record(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value);}
/** Only verified native cache signals invalidate a scope; ordinary records/polls do not. */
export function invalidatePhotoPreviews(current:PhotoPreviewLifecycle,payload:unknown):PhotoPreviewLifecycle {
  if(!record(payload)||Object.keys(payload).length!==1||typeof payload.scope!=='string'||!['own','partner','all'].includes(String(payload.scope)))return current;
  return {...current,own:current.own+(payload.scope==='own'||payload.scope==='all'?1:0),partner:current.partner+(payload.scope==='partner'||payload.scope==='all'?1:0)};
}
export function updatePhotoLifecycle(current:PhotoPreviewLifecycle,payload:unknown):PhotoPreviewLifecycle {
  if(!record(payload)||Object.keys(payload).length!==1||typeof payload.state!=='string'||!['foreground','background'].includes(String(payload.state)))return current;
  if(payload.state==='background')return current.paused?current:{...current,paused:true};
  return current.paused?{own:current.own+1,partner:current.partner+1,paused:false}:current;
}
export interface PhotoPreviewState {uri:string|null;error:boolean;loading:boolean;generation:number}
/** Late reads and stale native image errors cannot reintroduce a revoked or background preview. */
export function createPhotoPreviewLoader(publish:(state:PhotoPreviewState)=>void) {
  let sequence=0;let current:PhotoPreviewState={uri:null,error:false,loading:false,generation:0};
  const emit=(value:PhotoPreviewState)=>{current=value;publish(value);};
  return {
    load(id:string,reader:(id:string)=>Promise<string>):()=>void {
      const generation=++sequence;emit({uri:null,error:false,loading:true,generation});
      void Promise.resolve().then(()=>reader(id)).then(uri=>{
        if(generation!==sequence)return;
        if(typeof uri!=='string'||uri==='')emit({uri:null,error:true,loading:false,generation});
        else emit({uri,error:false,loading:false,generation});
      }).catch(()=>{if(generation===sequence)emit({uri:null,error:true,loading:false,generation});});
      return()=>{if(generation===sequence)sequence+=1;};
    },
    suspend(){sequence+=1;emit({uri:null,error:false,loading:false,generation:sequence});},
    imageFailed(uri:string,generation:number){
      if(current.uri===uri&&current.generation===generation)emit({uri:null,error:true,loading:false,generation});
    },
  };
}
