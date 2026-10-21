import { calculateExerciseKcal, exercises } from '@zzzode/exercise-data';
import type { HostData } from './types.js';

/** A later weighing must never become the basis for a historical activity. */
export function weightForRecordDate(data: Pick<HostData,'weights'>, date:string): number | undefined {
  const records=data.weights.filter(item=>item.date<=date).slice().sort((a,b)=>a.date.localeCompare(b.date));
  const weight=records[records.length-1]?.weightKg;
  return typeof weight==='number'&&Number.isFinite(weight)&&weight>0?weight:undefined;
}
export function exerciseEstimateForDate(data: Pick<HostData,'weights'>, date:string, typeId:string, durationMin:number): number | null {
  const weight=weightForRecordDate(data,date);
  const type=exercises.find(item=>item.id===typeId);
  if(weight===undefined||type===undefined||!Number.isFinite(durationMin)||durationMin<1||durationMin>1440)return null;
  return calculateExerciseKcal(type,durationMin,weight);
}
