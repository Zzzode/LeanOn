import type { LeanOnBridgeClient, RecordMutation, RecordsMutationRequest } from '@zzzode/bridge';
import { readHostDataEnvelope } from './host-data.js';
import type { HostData } from './types.js';

let sequence = 0;
/** Identity uses a nonce; calendar dates always come from the native snapshot. */
export function newRecordId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}-${Math.random().toString(36).slice(2, 10)}`;
}
export interface RecordDraft {
  date: string;
  revision: number;
  id: string;
  request?: RecordsMutationRequest;
}
export function openRecordDraft(data: HostData, date = data.today, id = newRecordId('entry')): RecordDraft {
  return { date, revision: data.revision, id };
}
/** An interrupted response retries the exact operation; changing a draft creates a new operation. */
export async function saveRecordDraft(bridge: LeanOnBridgeClient, draft: RecordDraft, mutation: RecordMutation): Promise<{ hostData: HostData; undoToken?: string }> {
  if (draft.request === undefined || JSON.stringify(draft.request.mutation) !== JSON.stringify(mutation)) {
    draft.request = { operationId: newRecordId('operation'), expectedRevision: draft.revision, mutation };
  }
  const response = await bridge.invoke('records.mutate', draft.request);
  const hostData = readHostDataEnvelope(response);
  if (response.success !== true || hostData === null || !Number.isInteger(response.appliedRevision) || response.appliedRevision < 0 || typeof response.replayed !== 'boolean') {
    throw new Error('Invalid record mutation response');
  }
  return { hostData, ...(response.undoToken === undefined ? {} : { undoToken: response.undoToken }) };
}
export function isRecordConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'conflict';
}

/** Auxiliary food/catalogue writes may advance only their own exact next revision. */
export function advanceDraftAfterAuxiliary(draft: RecordDraft | null, beforeRevision: number, received: HostData, current: HostData | null): boolean {
  if (draft === null || draft.request !== undefined || draft.revision !== beforeRevision
    || received.revision !== beforeRevision + 1 || current === null || current.revision !== received.revision) return false;
  draft.revision = received.revision;
  return true;
}
export interface SnapshotPresentationOrder {
  requestStartedAt: number;
  currentSequence: number;
}
/** Equal storage revisions can carry different native clocks; request order decides freshness. */
export function newestRecordSnapshot(current: HostData | null, incoming: HostData, order?: SnapshotPresentationOrder): HostData {
  if (current === null || incoming.revision > current.revision) return incoming;
  if (incoming.revision < current.revision) return current;
  if (order !== undefined && order.currentSequence > order.requestStartedAt) {
    const result = { ...incoming, today: current.today, streak: current.streak };
    if (current.todayHour === undefined) delete result.todayHour;
    else result.todayHour = current.todayHour;
    return result;
  }
  // A newly delivered native event may legitimately move the date backward after a time-zone change.
  return incoming;
}
/** Explicit review follows a definite conflict; ambiguous failures keep the original request. */
export function reviewConflictedDraft(draft: RecordDraft, reviewedRevision: number): void {
  draft.revision = reviewedRevision;
  if (draft.request !== undefined) draft.request = { ...draft.request, expectedRevision: reviewedRevision };
}

/** An open draft can recover a failed read without silently adopting a newer write revision. */
export async function saveRecordDraftWithRecovery(
  bridge: LeanOnBridgeClient,
  draft: RecordDraft,
  mutation: RecordMutation,
  readRequired: boolean,
  onReadSnapshot: (data: HostData) => void,
): Promise<{hostData:HostData;undoToken?:string}> {
  if (readRequired) {
    const response = await bridge.invoke('records.getSnapshot');
    const snapshot = readHostDataEnvelope(response);
    if (snapshot === null) throw new Error('Invalid recovery snapshot');
    onReadSnapshot(snapshot);
  }
  return saveRecordDraft(bridge,draft,mutation);
}
