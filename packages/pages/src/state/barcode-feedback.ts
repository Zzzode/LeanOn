import type { ScanFoodError } from './scan-food.js';

export interface BarcodeFeedback {
  value: string;
  error: ScanFoodError | null;
}
export type BarcodeFeedbackEvent =
  | {type:'input';value:string}
  | {type:'lookup-error';error:ScanFoodError;barcode?:string}
  | {type:'clear-error'};

/** Native setValue may emit input; only a changed barcode invalidates lookup feedback. */
export function updateBarcodeFeedback(state: BarcodeFeedback, event: BarcodeFeedbackEvent): BarcodeFeedback {
  if(event.type==='input')return event.value===state.value?state:{value:event.value,error:null};
  if(event.type==='lookup-error')return {value:event.barcode??state.value,error:event.error};
  return {...state,error:null};
}
