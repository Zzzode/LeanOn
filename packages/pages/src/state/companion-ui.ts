import { isCompanionResponse, hasCurrentCompanionSession, type CompanionResponseDto, type ShareCategory, type CompanionInvitationDto } from '@zzzode/data';

export type CompanionView = CompanionResponseDto;
export function readCompanionView(value: unknown): CompanionView | null {
  if(typeof value!=='object'||value===null||Array.isArray(value))return null;
  const data=value as Record<string,unknown>;
  const response={companion:data.companion,runtime:data.runtime};
  return isCompanionResponse(response)?response:null;
}
export function companionSessionActive(value: CompanionView): boolean {
  return hasCurrentCompanionSession(value.companion,value.runtime.nativeNow);
}
export const SHARE_CATEGORIES: readonly ShareCategory[]=['goal','progress_band','checkin_streak','meals','photos','menstrual','exact_weight','body_measurements','encouragement'];
export function canConfirmInvitation(invitation: CompanionInvitationDto, nativeNow: string): boolean {
  return invitation.direction==='outgoing'&&invitation.status==='awaiting-confirmation'&&invitation.recipientId!==null&&invitation.recipientDeviceId!==null&&Date.parse(invitation.expiresAt)>Date.parse(nativeNow);
}
export function canSendEncouragement(view: CompanionView): boolean {
  return companionSessionActive(view)&&view.runtime.deviceAuthorized&&view.companion.binding!==null
    &&view.companion.shareSettings.categories.includes('encouragement')
    &&view.companion.peerSnapshot?.sharedCategories.includes('encouragement')===true;
}
/** Loopback HTTP is a deliberate local-test option; remote connections require HTTPS. */
export function companionEndpointValid(value: string): boolean {
  const match=/^(https?):\/\/(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(?::(\d{1,5}))?\/?$/.exec(value.trim());
  if(match===null)return false;const scheme=match[1];const host=match[2];const port=match[3];
  if(host===undefined||port!==undefined&&(Number(port)<1||Number(port)>65535))return false;
  return scheme==='https'||['localhost','127.0.0.1','10.0.2.2','[::1]'].includes(host.toLowerCase());
}
