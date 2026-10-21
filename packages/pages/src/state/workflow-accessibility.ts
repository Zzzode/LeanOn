import type {Translator} from '@zzzode/i18n';
/** Android Lynx 3.9 ignores accessibility-value, so the label also carries choice state. */
export function workflowChoiceLabel(t:Translator,label:string,selected:boolean,disabled:boolean):string {
  return `${label} · ${t(selected?'workflow.selected':'workflow.notSelected')}${disabled?' · '+t('workflow.disabled'):''}`;
}
