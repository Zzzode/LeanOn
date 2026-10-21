import type { LeanOnBridgeClient } from '@zzzode/bridge';
import { isPersonalState, type PersonalStateDto, type PersonalMutationRequestDto } from '@zzzode/data';

export function readPersonal(value:unknown):PersonalStateDto|null {
  return typeof value==='object'&&value!==null&&'personal' in value&&isPersonalState(value.personal)?value.personal:null;
}
export function newestPersonal(current:PersonalStateDto|null,next:PersonalStateDto):PersonalStateDto {
  return current!==null&&current.revision>next.revision?current:next;
}
/** Retry recovery reads the store without rebasing the original operation or revision. */
export async function savePersonal(bridge:LeanOnBridgeClient,request:PersonalMutationRequestDto,recover:boolean,onRecovered:(personal:PersonalStateDto)=>void):Promise<PersonalStateDto> {
  if(recover){const fresh=readPersonal(await bridge.invoke('personal.getState'));if(fresh===null)throw new Error('Invalid personal snapshot');onRecovered(fresh);}
  const response=await bridge.invoke('personal.mutate',request);
  const personal=readPersonal(response);
  if(response.success!==true||personal===null||!Number.isSafeInteger(response.appliedRevision)||response.appliedRevision<0||typeof response.replayed!=='boolean')throw new Error('Invalid personal write response');
  return personal;
}
