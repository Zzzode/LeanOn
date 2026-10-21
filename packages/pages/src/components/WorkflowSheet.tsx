import {ModalInvokerContext,WorkflowInsideContext} from './ModalFocusContext.js';
import {workflowChoiceLabel} from '../state/workflow-accessibility.js';
import {workflowNeedsWholeScroll,workflowFocusOffset,type WorkflowDimensions} from '../state/workflow-layout.js';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type Context, type ReactNode } from '@lynx-js/react';
import type { LayoutChangeEvent } from '@lynx-js/types';
import type { Translator } from '@zzzode/i18n';
import { useTheme } from './ThemeContext.js';
import { newRecordId } from '../state/record-mutation.js';
import type { RegisterInnerDismiss } from '../state/modal-dismiss.js';
import { SheetFeedback } from './SheetFeedback.js';

export const WorkflowDismissContext: Context<RegisterInnerDismiss> = createContext<RegisterInnerDismiss>(()=>()=>{});

interface FieldReveal { focus: (id: string, active: boolean) => void }
const FieldRevealContext: Context<FieldReveal> = createContext<FieldReveal>({focus:()=>{}});

export interface WorkflowSheetProps {
  t: Translator;
  title: string;
  note?: string;
  children: ReactNode;
  busy?: boolean;
  feedback?: string | null;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
}

/** The scroll viewport ends above fixed feedback/actions, including with an open keyboard. */
export function WorkflowSheet({t,title,note,children,busy=false,feedback=null,onClose,onSave,saveLabel,saveDisabled=false}: WorkflowSheetProps) {
  const headingId=useRef(newRecordId('workflow-heading')).current;
  const feedbackId=useRef(newRecordId('workflow-feedback')).current;
  useEffect(()=>{lynx.createSelectorQuery().select(`#${headingId}`).invoke({method:'requestAccessibilityFocus'}).exec();},[]);
  useEffect(()=>{if(feedback!==null)lynx.createSelectorQuery().select(`#${feedbackId}`).invoke({method:'requestAccessibilityFocus'}).exec();},[feedback]);
  const registerDismiss=useContext(WorkflowDismissContext);
  useEffect(()=>registerDismiss(()=>{if(!busy)onClose();}),[registerDismiss,onClose,busy]);
  const focused = useRef<string | null>(null);
  const viewportId=useRef(newRecordId('workflow-viewport')).current;
  const contentId=useRef(newRecordId('workflow-content')).current;
  const [dimensions,setDimensions]=useState<WorkflowDimensions>({viewport:0,header:0,footer:0});
  const [bodyHeight,setBodyHeight]=useState(0);
  const wholeScroll=workflowNeedsWholeScroll(dimensions);const wholeScrollRef=useRef(wholeScroll);wholeScrollRef.current=wholeScroll;
  const measure=(part:keyof WorkflowDimensions,height:number)=>{if(Number.isFinite(height))setDimensions(current=>current[part]===height?current:{...current,[part]:height});};
  const height = useRef<number | null>(null);const outerScrollTop=useRef(0);
  const reveal = () => {
    const id=focused.current;if(id===null)return;
    if(!wholeScrollRef.current){
      lynx.createSelectorQuery().select(`#${id}-field`).invoke({method:'scrollIntoView',params:{scrollIntoViewOptions:{block:'center',inline:'start',behavior:'none'}}}).exec();return;
    }
    let field:{top:number;height:number}|null=null;let viewport:number|null=null;
    const scroll=()=>{
      if(field===null||viewport===null||focused.current!==id||!wholeScrollRef.current)return;
      if(field.top>=outerScrollTop.current+8&&field.top+field.height<=outerScrollTop.current+viewport-8)return;
      const offset=workflowFocusOffset(field.top,field.height,viewport);if(offset===null)return;
      lynx.createSelectorQuery().select(`#${viewportId}`).invoke({method:'scrollTo',params:{index:0,offset,smooth:false}}).exec();
    };
    lynx.createSelectorQuery().select(`#${id}-field`).invoke({method:'boundingClientRect',params:{relativeTo:contentId},success:(rect:{top:number;height:number})=>{field=rect;scroll();}}).exec();
    lynx.createSelectorQuery().select(`#${viewportId}`).invoke({method:'boundingClientRect',params:{},success:(rect:{height:number})=>{viewport=rect.height;scroll();}}).exec();
  };
  useEffect(()=>{reveal();},[wholeScroll,dimensions.viewport,bodyHeight]);
  const context = useMemo<FieldReveal>(()=>({focus:(id,active)=>{
    if(active){focused.current=id;reveal();}
    else if(focused.current===id)focused.current=null;
  }}),[]);
  const layout = (event: LayoutChangeEvent) => {
    if(height.current===event.detail.height)return;
    height.current=event.detail.height;reveal();
  };
  return <WorkflowInsideContext.Provider value={true}><view className="Sheet-overlay" bindtap={busy?undefined:onClose}>
    <view className={`Sheet Workflow-sheet${wholeScroll?' whole-scroll':''}`} accessibility-exclusive-focus={true} catchtap={()=>{}}>
      <scroll-view id={viewportId} className="Workflow-viewport" scroll-orientation="vertical" enable-scroll={wholeScroll} bindscroll={event=>{outerScrollTop.current=event.detail.scrollTop;}} bindlayoutchange={event=>{measure('viewport',event.detail.height);layout(event);}}>
        <view id={contentId} flatten={false} className="Workflow-content" style={!wholeScroll&&dimensions.viewport>0?{height:`${dimensions.viewport}px`}:undefined}>
          <view className="Workflow-heading-block" bindlayoutchange={event=>measure('header',event.detail.height)}>
            <view className="Sheet-header"><view id={headingId} flatten={false} accessibility-element={true} accessibility-heading={true} accessibility-label={title}><text className="Sheet-title">{title}</text></view></view>
            {note!==undefined&&<text className="Section-note">{note}</text>}
          </view>
          <FieldRevealContext.Provider value={context}>
            <scroll-view className="Workflow-body" scroll-orientation="vertical" enable-scroll={!wholeScroll} style={wholeScroll?{height:`${Math.max(bodyHeight,112)}px`,flex:'none'}:undefined} bindlayoutchange={layout}>
              <view className="Workflow-fields" flatten={false} bindlayoutchange={event=>{const value=event.detail.height;if(Number.isFinite(value))setBodyHeight(current=>current===value?current:value);}}>{children}</view>
            </scroll-view>
          </FieldRevealContext.Provider>
          <view className="Workflow-footer-block" bindlayoutchange={event=>measure('footer',event.detail.height)}>
            <view id={feedbackId} flatten={false} accessibility-element={feedback!==null} accessibility-label={feedback??undefined}><SheetFeedback message={feedback}/></view>
            <view className="Sheet-actions">
              <WorkflowButton t={t} label={t('daily.cancel')} disabled={busy} onTap={onClose}/>
              {onSave!==undefined&&<WorkflowButton t={t} label={busy?t('review.saving'):saveLabel??t('daily.save')} primary disabled={busy||saveDisabled} onTap={onSave}/>} 
            </view>
          </view>
        </view>
      </scroll-view>
    </view>
  </view></WorkflowInsideContext.Provider>;
}

export interface WorkflowFieldProps {
  id: string;
  label: string;
  initialValue?: string;
  hint?: string;
  type?: 'text'|'number'|'digit'|'password'|'tel'|'email';
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
}

/** Native inputs stay uncontrolled; same-value programmatic events do not clear a draft's error. */
export function WorkflowField({id,label,initialValue='',hint,type='text',disabled=false,invalid=false,onChange}: WorkflowFieldProps) {
  const palette=useTheme();const reveal=useContext(FieldRevealContext);
  const value=useRef(initialValue);const [focused,setFocused]=useState(false);
  useEffect(()=>{
    lynx.createSelectorQuery().select(`#${id}`).invoke({method:'setValue',params:{value:initialValue}}).exec();
  },[]);
  return <view className="Workflow-field">
    <text className="Form-label">{label}</text>
    <view id={`${id}-field`} flatten={false} className={`Sheet-field${focused?' focused':''}${invalid?' invalid':''}`}>
      <input id={id} className="Sheet-input" type={type} disabled={disabled} confirm-type="done"
        accessibility-element={true} accessibility-label={label}
        placeholder={hint??''} placeholder-color={palette.muted} caret-color={palette.brand}
        bindfocus={()=>{setFocused(true);reveal.focus(id,true);}}
        bindblur={()=>{setFocused(false);reveal.focus(id,false);}}
        bindconfirm={()=>lynx.createSelectorQuery().select(`#${id}`).invoke({method:'blur'}).exec()}
        bindinput={(event:{detail:{value:string}})=>{if(value.current===event.detail.value)return;value.current=event.detail.value;onChange(value.current);}}/>
    </view>
    {hint!==undefined&&<text className="Section-note">{hint}</text>}
  </view>;
}

export function WorkflowButton({label,onTap,disabled=false,primary=false,danger=false,t,accessibleLabel}:{label:string;accessibleLabel?:string;onTap:()=>void;disabled?:boolean;primary?:boolean;danger?:boolean;t?:Translator}) {
  const id=useRef(newRecordId('workflow-button')).current;
  const remember=useContext(ModalInvokerContext);const insideSheet=useContext(WorkflowInsideContext);
  return <view id={id} flatten={false} className={`Sheet-btn${primary?' primary':''}${danger?' danger':''}${disabled?' disabled':''}`}
    accessibility-element={true} accessibility-traits="button" accessibility-label={accessibleLabel??label} accessibility-value={disabled&&t!==undefined?t('workflow.disabled'):undefined}
    hover-class={disabled?undefined:'tap-feedback-hover'} bindtap={disabled?undefined:()=>{remember(id,insideSheet);onTap();}}>
    <text className={`Sheet-btn-label${primary?' primary':''}${danger?' danger':''}`}>{label}</text>
  </view>;
}

export function WorkflowChoice({label,selected,onTap,disabled=false,t}:{label:string;selected:boolean;onTap:()=>void;disabled?:boolean;t:Translator}) {
  return <view flatten={false} className={`Workflow-choice${selected?' selected':''}${disabled?' disabled':''}`}
    accessibility-element={true} accessibility-traits="button" accessibility-label={workflowChoiceLabel(t,label,selected,disabled)}
    accessibility-value={`${t(selected?'workflow.selected':'workflow.notSelected')}${disabled?' · '+t('workflow.disabled'):''}`} bindtap={disabled?undefined:onTap}>
    <text className="Action-label">{selected?'✓ ':''}{label}</text>
  </view>;
}
