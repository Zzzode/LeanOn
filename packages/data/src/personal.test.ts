import { describe, expect, it } from '@rstest/core';
import { applyPersonalMutation, compareMeasurementTrend, createEmptyPersonalState, isDietaryPreferences, isMeasurement, isPersonalState } from './personal.js';
import type { PersonalStateDto, ProgressPhotoDto } from './personal.js';
const photo:ProgressPhotoDto={id:'photo-1',date:'2026-10-07',view:'front',createdAt:'2026-10-07T10:00:00Z',mime:'image/jpeg',width:400,height:600};
describe('personal records',()=>{
  it('keeps unknown JSON preferences when changing known values without altering input',()=>{
    const state=createEmptyPersonalState();state.dietaryPreferences['future']={mealTimes:['08:00','18:00']};
    const result=applyPersonalMutation(state,{operationId:'preferences-1',expectedRevision:0,mutation:{type:'set-dietary-preferences',preferences:{pattern:'vegetarian',excludedFoodIds:['rice'],notes:'Personal preference'}}});
    expect(result.personal.dietaryPreferences['future']).toEqual({mealTimes:['08:00','18:00']});expect(state.revision).toBe(0);expect(result.personal.revision).toBe(1);
  });
  it('replays identical operations before CAS but rejects reused identity and stale writes',()=>{
    const request={operationId:'m-1',expectedRevision:0,mutation:{type:'save-measurement' as const,measurement:{id:'waist-1',date:'2026-10-07',waistCm:90}}};
    const first=applyPersonalMutation(createEmptyPersonalState(),request);
    expect(applyPersonalMutation(first.personal,request).replayed).toBe(true);
    expect(()=>applyPersonalMutation(first.personal,{...request,mutation:{type:'save-measurement',measurement:{id:'waist-1',date:'2026-10-07',waistCm:89}}})).toThrow();
    expect(()=>applyPersonalMutation(first.personal,{...request,operationId:'m-2'})).toThrow();
  });
  it('sorts trends by real dates and never converts unknown centimeters into zero',()=>{
    const trend=compareMeasurementTrend([{id:'c',date:'2026-10-07',waistCm:88},{id:'b',date:'2026-10-02',hipCm:95},{id:'a',date:'2026-10-01',waistCm:90}],'waistCm');
    expect(trend.points.map(row=>row.date)).toEqual(['2026-10-01','2026-10-07']);expect(trend.changeCm).toBe(-2);
    expect(compareMeasurementTrend([{id:'b',date:'2026-10-02',hipCm:95}],'waistCm').changeCm).toBe(null);
  });
  it('rejects duplicate identity, invalid dates, unsupported schema and absent measurements',()=>{
    expect(isMeasurement({id:'m',date:'2026-02-30',waistCm:90})).toBe(false);
    expect(isMeasurement({id:'m',date:'2026-10-07'})).toBe(false);expect(isMeasurement({id:'m',date:'2026-10-07',waistCm:0})).toBe(false);
    const state=createEmptyPersonalState();state.measurements=[{id:'m',date:'2026-10-07',waistCm:90},{id:'m',date:'2026-10-06',waistCm:88}];
    expect(isPersonalState(state)).toBe(false);expect(isPersonalState({...createEmptyPersonalState(),version:2})).toBe(false);
  });
  it('supports metadata edit without replacing persisted image identity or bytes metadata',()=>{
    const first=applyPersonalMutation(createEmptyPersonalState(),{operationId:'p-1',expectedRevision:0,mutation:{type:'add-photo',photo}}).personal;
    const edited=applyPersonalMutation(first,{operationId:'p-2',expectedRevision:1,mutation:{type:'update-photo',photo:{...photo,view:'side',note:'Same derivative'}}});
    expect(edited.personal.photos[0]?.view).toBe('side');expect(first.photos[0]?.view).toBe('front');
    expect(()=>applyPersonalMutation(first,{operationId:'p-3',expectedRevision:1,mutation:{type:'update-photo',photo:{...photo,width:800}}})).toThrow();
  });
  it('rejects hidden credentials, cycles, huge and deeply nested preference extensions',()=>{
    for(const key of ['token','session','access_token','proofHash','familyKey','vaultKey'])expect(isDietaryPreferences({pattern:'none',excludedFoodIds:[],notes:'',future:{[key]:'secret'}})).toBe(false);
    expect(isDietaryPreferences({pattern:'none',excludedFoodIds:[],notes:'',future:'x'.repeat(32769)})).toBe(false);
    const cycle:Record<string,unknown>={};cycle['next']=cycle;expect(isDietaryPreferences({pattern:'none',excludedFoodIds:[],notes:'',future:cycle})).toBe(false);
  });
  it('applies the serialized preference quota to UTF-8 bytes including Chinese and emoji',()=>{
    const base={pattern:'none',excludedFoodIds:[],notes:'',future:''};
    const overhead=JSON.stringify(base).length;
    expect(isDietaryPreferences({...base,future:'中'.repeat(Math.floor((32768-overhead)/3))})).toBe(true);
    expect(isDietaryPreferences({...base,future:'中'.repeat(Math.floor((32768-overhead)/3)+1)})).toBe(false);
    expect(isDietaryPreferences({...base,future:'🔒'.repeat(Math.floor((32768-overhead)/4)+1)})).toBe(false);
  });
  it('does not mutate state after missing record, invalid edit or conflicting operation',()=>{
    const state=createEmptyPersonalState();const before=JSON.stringify(state);
    expect(()=>applyPersonalMutation(state,{operationId:'delete',expectedRevision:0,mutation:{type:'delete-measurement',id:'missing'}})).toThrow();expect(JSON.stringify(state)).toBe(before);
    const invalid:PersonalStateDto={...state,revision:NaN};expect(()=>applyPersonalMutation(invalid,{operationId:'a',expectedRevision:0,mutation:{type:'add-photo',photo}})).toThrow();
  });
});
