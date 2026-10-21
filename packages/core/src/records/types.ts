import type { ExerciseSample, IntakeSample, Macros, Micros, Profile, WaterSample, WeightSample } from '../types';

export type GuidanceMode = 'weight-loss' | 'tracking-only';

/** Null means not assessed; it must never be treated as a negative screen. */
export interface SafetyFlags {
  pregnant: boolean | null;
  breastfeeding: boolean | null;
  eatingDisorderRisk: boolean | null;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** Nutrients describe this logged portion, not a per-100-g catalogue item. */
export interface IntakeEntry {
  id: string;
  date: string;
  meal: MealType;
  name: string;
  grams: number;
  kcal: number;
  macros: Macros;
  micros: Micros;
  foodId?: string;
}

export interface WeightRecord extends WeightSample { id: string }
export interface WaterRecord extends WaterSample { id: string }
export interface LegacyIntakeRecord extends IntakeSample { id: string }
export type RecordKind = 'weight' | 'water' | 'exercise' | 'intake' | 'legacy-intake';

interface DeletionMetadata {
  /** Durable local restore identity; not an authentication credential. */
  token: string;
  deletedAt: string;
  deletedRevision: number;
}

export type DeletedRecord = DeletionMetadata & (
  | { kind: 'weight'; record: WeightRecord }
  | { kind: 'water'; record: WaterRecord }
  | { kind: 'exercise'; record: ExerciseSample }
  | { kind: 'intake'; record: IntakeEntry }
  | { kind: 'legacy-intake'; record: LegacyIntakeRecord }
);

export type RecordMutation =
  | {
      type: 'save-profile';
      profile: Profile;
      goalWeightKg: number | null;
      weeklyLossKg: number | null;
      guidanceMode: GuidanceMode;
      safetyFlags: SafetyFlags;
      /** First setup only; stored against the native host's current local date. */
      initialWeightKg?: number;
    }
  | { type: 'set-weight'; id?: string; date: string; weightKg: number }
  | { type: 'set-water'; id?: string; date: string; amountMl: number }
  | { type: 'save-exercise'; exercise: ExerciseSample }
  | { type: 'save-intake'; entry: IntakeEntry }
  | { type: 'save-legacy-intake'; sample: LegacyIntakeRecord }
  | { type: 'delete-record'; kind: RecordKind; id: string }
  | { type: 'restore-record'; token: string };

/** Retained durably without eviction so an interrupted retry cannot duplicate writes. */
export interface OperationReceipt {
  operationId: string;
  mutation: RecordMutation;
  appliedRevision: number;
  undoToken?: string;
}

/** Persisted domain state; clocks and food catalogues belong to the host. */
export interface RecordsState {
  schemaVersion: 2;
  revision: number;
  setupCompleted: boolean;
  profile: Profile | null;
  goalWeightKg: number | null;
  weeklyLossKg: number | null;
  guidanceMode: GuidanceMode;
  safetyFlags: SafetyFlags;
  weights: WeightRecord[];
  water: WaterRecord[];
  exercises: ExerciseSample[];
  /** Historical aggregates are retained without inventing individual meals. */
  legacyIntake: LegacyIntakeRecord[];
  intakeEntries: IntakeEntry[];
  /** Derived from legacyIntake and active intakeEntries; not directly mutable. */
  intake: IntakeSample[];
  deletedRecords: DeletedRecord[];
  processedOperations: OperationReceipt[];
}

export interface RecordsMutationRequest {
  operationId: string;
  expectedRevision: number;
  mutation: RecordMutation;
}

export interface RecordMutationResult {
  state: RecordsState;
  appliedRevision: number;
  replayed: boolean;
  undoToken?: string;
}

/** Supplied by native code; the pure domain never reads a clock. */
export interface RecordsClock {
  today: string;
  deletedAt: string;
}
