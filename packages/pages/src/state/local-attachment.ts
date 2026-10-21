import type { PersonalStateDto } from '@zzzode/data';
import type { HostData } from './types.js';
export interface LocalAttachmentPreview {
  expectedRecordsRevision:number;expectedPersonalRevision:number;
  counts:{weights:number;water:number;exercises:number;meals:number;legacy:number;measurements:number;photos:number};
}
export function localAttachmentPreview(records:HostData,personal:PersonalStateDto):LocalAttachmentPreview {
  return {expectedRecordsRevision:records.revision,expectedPersonalRevision:personal.revision,
    counts:{weights:records.weights.length,water:records.water.length,exercises:records.exercises.length,meals:records.intakeEntries.length,legacy:records.legacyIntake.length,measurements:personal.measurements.length,photos:personal.photos.length}};
}

import type { CompanionView } from './companion-ui.js';
import { companionSessionActive } from './companion-ui.js';
import type { CompanionAction } from './companion-actions.js';
/** Consent belongs to a named account and a pinned preview; neither login nor Sync supplies it. */
export function attachmentAction(preview:LocalAttachmentPreview|undefined,namedAccountId:string|null,current:CompanionView,consent:boolean):CompanionAction|null {
  if(!consent||preview===undefined||namedAccountId===null||current.companion.account?.id!==namedAccountId||!companionSessionActive(current)||!current.runtime.deviceAuthorized)return null;
  return {type:'attachLocalData',expectedRecordsRevision:preview.expectedRecordsRevision,expectedPersonalRevision:preview.expectedPersonalRevision};
}
