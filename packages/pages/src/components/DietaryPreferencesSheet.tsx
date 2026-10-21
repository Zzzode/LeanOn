import { useMemo, useRef, useState } from '@lynx-js/react';
import { isDietaryPreferences, type DietaryPreferencesDto, type PersonalMutationRequestDto } from '@zzzode/data';
import { foods, searchFoods, type FoodItem } from '@zzzode/food-data';
import type { Locale, Translator } from '@zzzode/i18n';
import { personalRequest } from '../state/personal-ui.js';
import { isRecordConflict } from '../state/record-mutation.js';
import { WorkflowChoice, WorkflowField, WorkflowSheet } from './WorkflowSheet.js';

export function DietaryPreferencesSheet({preferences,revision,customFoods,locale,t,onClose,onSave}:{preferences:DietaryPreferencesDto;revision:number;customFoods:readonly FoodItem[];locale:Locale;t:Translator;onClose:()=>void;onSave:(request:PersonalMutationRequestDto)=>Promise<void>}) {
  const [pattern,setPattern]=useState(preferences.pattern);
  const [notes,setNotes]=useState(preferences.notes);
  const [excluded,setExcluded]=useState(preferences.excludedFoodIds);
  const [query,setQuery]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
  const openedRevision=useRef(revision);const request=useRef<PersonalMutationRequestDto|null>(null);const pending=useRef(false);
  const database=useMemo(()=>[...foods,...customFoods],[customFoods]);
  const results=useMemo(()=>searchFoods(database,query,locale).slice(0,30),[database,query,locale]);
  const names=useMemo(()=>new Map(database.map(item=>[item.id,item.name[locale]])),[database,locale]);
  const toggle=(id:string)=>{if(pending.current)return;setExcluded(values=>values.includes(id)?values.filter(value=>value!==id):[...values,id]);setError(null);};
  const save=async()=>{
    if(pending.current)return;
    const value: DietaryPreferencesDto={...preferences,pattern,excludedFoodIds:excluded,notes};
    if(!isDietaryPreferences(value)){setError(t('personal.invalidPreferences'));return;}
    request.current=personalRequest(request.current,openedRevision.current,{type:'set-dietary-preferences',preferences:value});
    pending.current=true;setBusy(true);setError(null);
    try{await onSave(request.current);onClose();}
    catch(error){setError(t(isRecordConflict(error)?'personal.conflict':'personal.saveError'));}
    finally{pending.current=false;setBusy(false);}
  };
  return <WorkflowSheet t={t} title={t('personal.dietary')} note={t('personal.private')} busy={busy} feedback={error} onClose={onClose} onSave={()=>void save()}>
    <text className="Section-note">{t('personal.preferenceNote')}</text>
    <text className="Section-heading">{t('personal.pattern')}</text>
    {(['none','vegetarian','vegan'] as const).map(value=><WorkflowChoice t={t} key={value} label={t(`personal.${value}`)} selected={pattern===value} disabled={busy} onTap={()=>{setPattern(value);setError(null);}}/>)}
    <WorkflowField id="dietary-notes" label={t('personal.notes')} initialValue={preferences.notes} disabled={busy} onChange={value=>{setNotes(value);setError(null);}}/>
    <text className="Section-heading">{t('personal.exclusions')}</text>
    {excluded.map(id=><WorkflowChoice t={t} key={id} label={names.get(id)??id} selected disabled={busy} onTap={()=>toggle(id)}/>)}
    <WorkflowField id="dietary-search" label={t('personal.excludeSearch')} disabled={busy} onChange={setQuery}/>
    {results.filter(item=>!excluded.includes(item.id)).map(item=><WorkflowChoice t={t} key={item.id} label={item.name[locale]} selected={false} disabled={busy} onTap={()=>toggle(item.id)}/>)}
  </WorkflowSheet>;
}
