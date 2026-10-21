import {useEffect, useRef} from '@lynx-js/react';
import {newRecordId} from './record-mutation.js';

/** A changed page starts at its first photo; stale page callbacks cannot scroll a later page. */
export function usePhotoPageAnchor(index:number):string {
  const anchor=useRef(newRecordId('photo-page-start')).current;
  const previous=useRef(index);
  useEffect(()=>{
    if(previous.current===index)return;
    previous.current=index;
    const timer=setTimeout(()=>{
      lynx.createSelectorQuery().select(`#${anchor}`).invoke({method:'scrollIntoView',params:{scrollIntoViewOptions:{block:'start',inline:'start',behavior:'none'}}}).exec();
    },100);
    return ()=>clearTimeout(timer);
  },[index]);
  return anchor;
}
