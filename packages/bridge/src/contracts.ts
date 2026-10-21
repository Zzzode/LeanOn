import type {
  Macros,
  Micros,
  ReminderSettings,
  RecordsMutationRequest,
  RecordsState,
} from '@zzzode/core';
import type { FoodItem, OffProduct } from '@zzzode/food-data';
import type { BackupPreviewDto, CompanionResponseDto, PersonalMutationRequestDto, PersonalMutationResultDto, PersonalStateDto, ProgressPhotoDto, ShareCategory } from '@zzzode/data';
export type { CompanionResponseDto, CompanionRuntimeDto, CompanionAccountDeletionDto } from '@zzzode/data';
import type { JsonValue } from './types';

/**
 * LeanOn capability contracts. These are the only serialized shapes that cross
 * the bridge; they are deliberately flat and JSON-compatible.
 */

/**
 * Cross-boundary snapshot of the records the host owns for the Home page. It is
 * composed of core's JSON-friendly domain types and is structurally identical
 * to the page's HostData. The UI never owns a clock or persistence layer.
 */
export interface CompanionMigrationState {
  phase: 'idle' | 'review' | 'preparing' | 'prepared' | 'restoring' | 'publishing' | 'pausing' | 'paused' | 'activating' | 'active' | 'rolled-back';
  sourceEndpoint: string | null;
  targetEndpoint: string | null;
  targetServiceId: string | null;
  accountId: string | null;
  accountName: string | null;
  operationId: string | null;
  previewToken: string | null;
  counts: { weights: number; water: number; exercises: number; meals: number; measurements: number; photos: number };
  errorCode: string | null;
}
export interface CompanionMigrationResponse { migration: CompanionMigrationState }

export interface HostDataDto extends RecordsState {
  /** ISO date `YYYY-MM-DD` the host considers "today". */
  today: string;
  /** Local hour 0-23, used only for the greeting. */
  todayHour?: number;
  /** Number of consecutive logging days. */
  streak: number;
  /** User-created foods persisted by the host (RFC 0013); empty by default. */
  customFoods: FoodItem[];
  /** Food ids the user pinned (RFC 0015); empty by default. */
  favoriteFoodIds: string[];
  /** Most recently logged food ids first, capped (RFC 0015); empty by default. */
  recentFoodIds: string[];
}

/** Read-only camera state; this method never opens a camera or permission prompt. */
export interface ScannerStatus {
  cameraAvailable: boolean;
  hostAvailable: boolean;
  permission: 'not-determined' | 'authorized' | 'denied' | 'restricted';
}
export function isScannerStatus(value: unknown): value is ScannerStatus {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const status = value as Record<string, unknown>;
  return typeof status.cameraAvailable === 'boolean' && typeof status.hostAvailable === 'boolean'
    && typeof status.permission === 'string' && ['not-determined', 'authorized', 'denied', 'restricted'].includes(status.permission);
}

export type HealthDataType =
  | 'weight'
  | 'active-energy'
  | 'steps'
  | 'sleep'
  | 'menstrual';

export interface HealthSampleDto {
  type: HealthDataType;
  /** ISO date or date-time of the sample. */
  date: string;
  value: number;
  unit?: string;
}

export interface ReadSamplesRequest {
  types: HealthDataType[];
  start: string;
  end: string;
}

export interface ScaleDeviceDto {
  deviceId: string;
  name: string;
  rssi: number;
}

export interface ScaleReadingDto {
  deviceId: string;
  date: string;
  weightKg: number;
  /** Body-impedance value when the scale provides one. */
  impedance?: number;
}

/** High-level scale lifecycle state reported by the host. */
export type ScaleConnectionState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected';

export interface AppInfo {
  platform: 'ios' | 'android';
  hostVersion: string;
  deviceModel: string;
  osVersion: string;
}

/** The host persists this choice independently of the effective system theme. */
export type AppearancePreference = 'system' | 'light' | 'dark';
export type ResolvedAppearance = 'light' | 'dark';

/** Synchronous bootstrap, RPC response and event share one appearance shape. */
export interface AppearanceState {
  preference: AppearancePreference;
  resolved: ResolvedAppearance;
}

/** Native events are untrusted at runtime despite their compile-time contract. */
export function isAppearanceState(value: unknown): value is AppearanceState {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const { preference, resolved } = candidate;
  return (
    (preference === 'system' || preference === 'light' || preference === 'dark') &&
    (resolved === 'light' || resolved === 'dark') &&
    (preference === 'system' || preference === resolved)
  );
}

export interface HostCapabilities {
  platform: 'ios' | 'android';
  hostVersion: string;
  /** Bridge protocol version implemented by the host. */
  bridgeVersion: string;
  supportedMethods: string[];
  supportedEvents: string[];
}

export interface ScheduleNotificationRequest {
  id?: string;
  title: string;
  body: string;
  /** ISO date-time at which to fire. */
  triggerAt: string;
}

/** A request of type `void` means the method takes no arguments. */
export type LeanOnRpcContract = {
  'personal.getState': { request: void; response: { personal: PersonalStateDto } };
  'personal.mutate': { request: PersonalMutationRequestDto; response: PersonalMutationResultDto & { success: true } };
  'personal.pickPhoto': {
    request: { date: string; view: ProgressPhotoDto['view']; note?: string; operationId: string; expectedRevision: number };
    response: { cancelled: true } | { cancelled: false; personal: PersonalStateDto; photoId: string };
  };
  'personal.getPhoto': { request: { id: string; scope?: 'own' | 'partner' }; response: { uri: string; width: number; height: number } };
  'backup.export': { request: { password: string }; response: { cancelled: boolean; fileName?: string } };
  'backup.inspectImport': {
    request: { password: string };
    response: { cancelled: true } | {
      cancelled: false; token: string; expiresAt: string;
      summary: BackupPreviewDto & { hasProfile: boolean; includesPhotos: boolean };
      expectedRecordsRevision: number; expectedPersonalRevision: number;
    };
  };
  'backup.restore': {
    request: { token: string; expectedRecordsRevision: number; expectedPersonalRevision: number };
    response: { success: true; hostData: HostDataDto; personal: PersonalStateDto };
  };
  'companion.getMigrationState': { request: void; response: CompanionMigrationResponse };
  'companion.previewMigration': { request: { targetEndpoint: string; password: string }; response: CompanionMigrationResponse };
  'companion.startMigration': { request: { previewToken: string; password: string; backupPassword: string; consent: true }; response: CompanionMigrationResponse };
  'companion.resumeMigration': { request: { password: string; backupPassword: string; consent: true }; response: CompanionMigrationResponse };
  'companion.pauseMigration': { request: void; response: CompanionMigrationResponse };
  'companion.rollbackMigration': { request: { consent: true }; response: CompanionMigrationResponse };
  'companion.getState': { request: void; response: CompanionResponseDto };
  'companion.configure': { request: { endpoint: string }; response: CompanionResponseDto };
  'companion.register': { request: { login: string; password: string; admissionToken?: string }; response: CompanionResponseDto };
  'companion.login': { request: { login: string; password: string }; response: CompanionResponseDto };
  'companion.logout': { request: void; response: CompanionResponseDto };
  'companion.deleteAccount': { request: { password: string; deleteLocalData: boolean }; response: CompanionResponseDto };
  'companion.confirmAccountDeletionLocalData': { request: { deleteLocalData: boolean; expectedRecordsRevision: number; expectedPersonalRevision: number }; response: CompanionResponseDto };
  'companion.createInvitation': { request: { kind: 'family' | 'device' }; response: CompanionResponseDto & { invitationCode: string } };
  'companion.acceptInvitation': { request: { code: string }; response: CompanionResponseDto };
  'companion.confirmInvitation': { request: { id: string }; response: CompanionResponseDto };
  'companion.cancelInvitation': { request: { id: string }; response: CompanionResponseDto };
  'companion.setSharing': { request: { categories: ShareCategory[] }; response: CompanionResponseDto };
  'companion.attachLocalData': { request: { expectedRecordsRevision: number; expectedPersonalRevision: number }; response: CompanionResponseDto };
  'companion.sync': { request: void; response: CompanionResponseDto & { hostData: HostDataDto; personal: PersonalStateDto } };
  'companion.sendEncouragement': { request: { text: string }; response: CompanionResponseDto };
  'companion.unlink': { request: { deletePeerCache: true }; response: CompanionResponseDto };
  'records.getSnapshot': {
    request: void;
    response: { hostData: HostDataDto };
  };
  'records.mutate': {
    request: RecordsMutationRequest;
    response: {
      success: true;
      hostData: HostDataDto;
      appliedRevision: number;
      replayed: boolean;
      undoToken?: string;
    };
  };
  'health.authorize': {
    request: { types: HealthDataType[] };
    response: { granted: HealthDataType[]; denied: HealthDataType[] };
  };
  'health.readSamples': {
    request: ReadSamplesRequest;
    response: { samples: HealthSampleDto[] };
  };
  'health.writeWeight': {
    request: { date: string; weightKg: number };
    response: { success: true; hostData: HostDataDto };
  };
  'health.writeIntake': {
    request: {
      date: string;
      kcal: number;
      macros: Macros;
      /** Optional; the host fills zeros when omitted (RFC 0024). */
      micros?: Micros;
      /** When present, the host moves this food to the front of recent (RFC 0015). */
      foodId?: string;
    };
    response: { success: true; hostData: HostDataDto };
  };
  'health.writeWater': {
    request: { date: string; amountMl: number };
    response: { success: true; hostData: HostDataDto };
  };
  'health.writeExercise': {
    request: {
      date: string;
      typeId: string;
      durationMin: number;
      kcal: number;
    };
    response: { success: true; hostData: HostDataDto };
  };
  'health.updateExercise': {
    request: {
      id: string;
      date: string;
      typeId: string;
      durationMin: number;
      kcal: number;
    };
    response: { success: true; hostData: HostDataDto };
  };
  'health.deleteExercise': {
    request: { id: string };
    response: { success: true; hostData: HostDataDto };
  };
  'health.setFoodFavorite': {
    request: { id: string; favorite: boolean };
    response: { success: true; hostData: HostDataDto };
  };
  'health.writeCustomFood': {
    request: {
      name: string;
      /** Per 100 g. */
      kcal: number;
      proteinG?: number;
      carbsG?: number;
      fatG?: number;
      fiberG?: number;
      sugarG?: number;
      saturatedFatG?: number;
      sodiumMg?: number;
      defaultGrams?: number;
    };
    response: { success: true; hostData: HostDataDto };
  };
  'health.updateCustomFood': {
    request: {
      id: string;
      name: string;
      /** Per 100 g. */
      kcal: number;
      proteinG?: number;
      carbsG?: number;
      fatG?: number;
      fiberG?: number;
      sugarG?: number;
      saturatedFatG?: number;
      sodiumMg?: number;
      /** A number sets it; null clears the stored default. */
      defaultGrams?: number | null;
    };
    response: { success: true; hostData: HostDataDto };
  };
  'health.deleteCustomFood': {
    request: { id: string };
    response: { success: true; hostData: HostDataDto };
  };
  'health.writeScannedFood': {
    request: {
      barcode: string;
      name: string;
      /** Per 100 g. */
      kcal: number;
      proteinG?: number;
      carbsG?: number;
      fatG?: number;
      fiberG?: number;
      sugarG?: number;
      saturatedFatG?: number;
      sodiumMg?: number;
      defaultGrams?: number;
    };
    response: { success: true; hostData: HostDataDto };
  };
  'scale.scan': {
    request: void;
    response: { scanning: boolean };
  };
  'scale.connect': {
    request: { deviceId: string };
    response: { connected: boolean };
  };
  'scale.disconnect': {
    request: void;
    response: { connected: false };
  };
  'scale.getStatus': {
    request: void;
    response: { state: ScaleConnectionState; pairedDeviceId: string | null };
  };
  'scanner.getStatus': { request: void; response: ScannerStatus };
  'scanner.scanBarcode': {
    request: void;
    response: { barcode: string } | { cancelled: true };
  };
  'food.lookupProduct': {
    request: { barcode: string };
    response: { found: true; product: OffProduct } | { found: false };
  };
  'storage.get': {
    request: { key: string };
    response: { value: JsonValue | null };
  };
  'storage.set': {
    request: { key: string; value: JsonValue };
    response: { success: true };
  };
  'storage.remove': {
    request: { key: string };
    response: { success: true };
  };
  'resource.fetch': {
    request: { uri: string };
    response: { uri: string; integrity?: string };
  };
  'app.getInfo': {
    request: void;
    response: AppInfo;
  };
  'app.getCapabilities': {
    request: void;
    response: HostCapabilities;
  };
  'app.openRoute': {
    request: { route: string };
    response: { success: boolean };
  };
  'app.setModalActive': {
    request: { active: boolean };
    response: { success: true };
  };
  'app.setLocale': {
    request: { locale: 'en' | 'zh-CN' };
    response: { success: true; locale: 'en' | 'zh-CN' };
  };
  'app.getAppearance': {
    request: void;
    response: AppearanceState;
  };
  'app.setAppearance': {
    request: { preference: AppearancePreference };
    response: AppearanceState & { success: true };
  };
  'notification.schedule': {
    request: ScheduleNotificationRequest;
    response: { id: string };
  };
  'notification.getSettings': {
    request: void;
    response: { settings: ReminderSettings };
  };
  'notification.updateSettings': {
    request: { settings: ReminderSettings };
    response: { success: true; settings: ReminderSettings };
  };
  'notification.requestPermission': {
    request: void;
    response: { granted: boolean };
  };
  'healthConnect.getStatus': {
    request: void;
    response: {
      supported: boolean;
      enabled: boolean;
      permissionsGranted: boolean;
      lastSyncEpochMs: number;
    };
  };
  'healthConnect.sync': {
    request: void;
    response: { success: true; hostData: HostDataDto };
  };
  'healthConnect.requestPermission': {
    request: void;
    response: { granted: boolean };
  };
  'healthConnect.setEnabled': {
    request: { enabled: boolean };
    response: { success: boolean };
  };
  'healthKit.getStatus': {
    request: void;
    response: {
      supported: boolean;
      enabled: boolean;
      writeAuthorized: boolean;
      /** True when every supported nutrient write type is authorized. */
      nutritionWriteAuthorized?: boolean;
      /** HealthKit deliberately does not disclose read authorization. */
      readAccess: 'unknown';
      authorizationRequested: boolean;
      lastSyncEpochMs: number;
    };
  };
  'healthKit.requestPermission': {
    request: void;
    response: {
      completed: boolean;
      writeAuthorized: boolean;
      nutritionWriteAuthorized?: boolean;
      readAccess: 'unknown';
    };
  };
  'healthKit.setEnabled': {
    request: { enabled: boolean };
    response: { success: true };
  };
  'healthKit.sync': {
    request: void;
    response: { success: true; hostData: HostDataDto };
  };
};

export type LeanOnEventContract = {
  'personal.changed': { payload: { personal: PersonalStateDto } };
  'companion.migrationChanged': { payload: CompanionMigrationResponse };
  'companion.changed': { payload: CompanionResponseDto };
  'health.authorizationChanged': {
    payload: { granted: HealthDataType[]; denied: HealthDataType[] };
  };
  'scale.discovered': {
    payload: ScaleDeviceDto;
  };
  'scale.reading': {
    payload: ScaleReadingDto;
  };
  'records.changed': {
    payload: { hostData: HostDataDto };
  };
  'app.lifecycle': {
    payload: { state: 'background' | 'foreground' };
  };
  'app.photoPreviewsInvalidated': {
    payload: { scope: 'own' | 'partner' | 'all' };
  };
  'app.dismissModal': {
    payload: { reason: 'back' };
  };
  'app.localeChanged': {
    payload: { locale: 'en' | 'zh-CN' };
  };
  'app.appearanceChanged': {
    payload: AppearanceState;
  };
};

export const RpcMethods = {
  personalGetState: 'personal.getState',
  personalMutate: 'personal.mutate',
  personalPickPhoto: 'personal.pickPhoto',
  personalGetPhoto: 'personal.getPhoto',
  backupExport: 'backup.export',
  backupInspectImport: 'backup.inspectImport',
  backupRestore: 'backup.restore',
  companionGetMigrationState: 'companion.getMigrationState',
  companionPreviewMigration: 'companion.previewMigration',
  companionStartMigration: 'companion.startMigration',
  companionResumeMigration: 'companion.resumeMigration',
  companionPauseMigration: 'companion.pauseMigration',
  companionRollbackMigration: 'companion.rollbackMigration',
  companionGetState: 'companion.getState',
  companionConfigure: 'companion.configure',
  companionRegister: 'companion.register',
  companionLogin: 'companion.login',
  companionLogout: 'companion.logout',
  companionDeleteAccount: 'companion.deleteAccount',
  companionConfirmAccountDeletionLocalData: 'companion.confirmAccountDeletionLocalData',
  companionCreateInvitation: 'companion.createInvitation',
  companionAcceptInvitation: 'companion.acceptInvitation',
  companionConfirmInvitation: 'companion.confirmInvitation',
  companionCancelInvitation: 'companion.cancelInvitation',
  companionSetSharing: 'companion.setSharing',
  companionAttachLocalData: 'companion.attachLocalData',
  companionSync: 'companion.sync',
  companionSendEncouragement: 'companion.sendEncouragement',
  companionUnlink: 'companion.unlink',
  recordsGetSnapshot: 'records.getSnapshot',
  recordsMutate: 'records.mutate',
  healthAuthorize: 'health.authorize',
  healthReadSamples: 'health.readSamples',
  healthWriteWeight: 'health.writeWeight',
  healthWriteIntake: 'health.writeIntake',
  healthWriteWater: 'health.writeWater',
  healthWriteExercise: 'health.writeExercise',
  healthUpdateExercise: 'health.updateExercise',
  healthDeleteExercise: 'health.deleteExercise',
  healthSetFoodFavorite: 'health.setFoodFavorite',
  healthWriteCustomFood: 'health.writeCustomFood',
  healthUpdateCustomFood: 'health.updateCustomFood',
  healthDeleteCustomFood: 'health.deleteCustomFood',
  healthWriteScannedFood: 'health.writeScannedFood',
  scannerGetStatus: 'scanner.getStatus',
  scannerScanBarcode: 'scanner.scanBarcode',
  foodLookupProduct: 'food.lookupProduct',
  scaleScan: 'scale.scan',
  scaleConnect: 'scale.connect',
  scaleDisconnect: 'scale.disconnect',
  scaleGetStatus: 'scale.getStatus',
  storageGet: 'storage.get',
  storageSet: 'storage.set',
  storageRemove: 'storage.remove',
  resourceFetch: 'resource.fetch',
  appGetInfo: 'app.getInfo',
  appGetCapabilities: 'app.getCapabilities',
  appOpenRoute: 'app.openRoute',
  appSetModalActive: 'app.setModalActive',
  appSetLocale: 'app.setLocale',
  appGetAppearance: 'app.getAppearance',
  appSetAppearance: 'app.setAppearance',
  notificationSchedule: 'notification.schedule',
  notificationGetSettings: 'notification.getSettings',
  notificationUpdateSettings: 'notification.updateSettings',
  notificationRequestPermission: 'notification.requestPermission',
  healthConnectGetStatus: 'healthConnect.getStatus',
  healthConnectRequestPermission: 'healthConnect.requestPermission',
  healthConnectSetEnabled: 'healthConnect.setEnabled',
  healthConnectSync: 'healthConnect.sync',
  healthKitGetStatus: 'healthKit.getStatus',
  healthKitRequestPermission: 'healthKit.requestPermission',
  healthKitSetEnabled: 'healthKit.setEnabled',
  healthKitSync: 'healthKit.sync',
} as const satisfies Record<string, keyof LeanOnRpcContract>;

export const BridgeEvents = {
  personalChanged: 'personal.changed',
  companionChanged: 'companion.changed',
  healthAuthorizationChanged: 'health.authorizationChanged',
  scaleDiscovered: 'scale.discovered',
  scaleReading: 'scale.reading',
  recordsChanged: 'records.changed',
  appLifecycle: 'app.lifecycle',
  appPhotoPreviewsInvalidated: 'app.photoPreviewsInvalidated',
  appDismissModal: 'app.dismissModal',
  appLocaleChanged: 'app.localeChanged',
  appAppearanceChanged: 'app.appearanceChanged',
} as const satisfies Record<string, keyof LeanOnEventContract>;
