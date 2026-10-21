import type {Translator} from '@zzzode/i18n';
import {WorkflowButton} from './WorkflowSheet.js';
export function PhotoPager({t,index,totalPages,onPage}:{t:Translator;index:number;totalPages:number;onPage:(page:number)=>void}) {
  if(totalPages===0)return null;
  return <view>
    <text className="Section-note">{t('personal.photosPage',{page:index+1,total:totalPages})}</text>
    {totalPages>1&&<view className="Workflow-actions Photo-actions">
      <WorkflowButton t={t} label={t('personal.photosPrevious')} disabled={index===0} onTap={()=>onPage(index-1)}/>
      <WorkflowButton t={t} label={t('personal.photosNext')} disabled={index+1===totalPages} onTap={()=>onPage(index+1)}/>
    </view>}
  </view>;
}
