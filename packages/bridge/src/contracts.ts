import type { IntakeSample, Profile, WeightSample } from '@zzzode/core';
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
export interface HostDataDto {
  /** ISO date `YYYY-MM-DD` the host considers "today". */
  today: string;
  /** Local hour 0-23, used only for the greeting. */
  todayHour?: number;
  profile: Profile;
  /** Goal/target weight in kilograms. */
  goalWeightKg: number;
  /** Desired loss rate in kilograms per week (0.5-1 is the safe range). */
  weeklyLossKg: number;
  weights: WeightSample[];
  intake: IntakeSample[];
  /** Kilocalories burned through intentional exercise today. */
  todayExerciseKcal?: number;
  /** Number of consecutive logging days. */
  streak: number;
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

export interface AppInfo {
  platform: 'ios' | 'android';
  hostVersion: string;
  deviceModel: string;
  osVersion: string;
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
  'scale.scan': {
    request: void;
    response: { scanning: boolean };
  };
  'scale.connect': {
    request: { deviceId: string };
    response: { connected: boolean };
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
  'notification.schedule': {
    request: ScheduleNotificationRequest;
    response: { id: string };
  };
};

export type LeanOnEventContract = {
  'health.authorizationChanged': {
    payload: { granted: HealthDataType[]; denied: HealthDataType[] };
  };
  'scale.discovered': {
    payload: ScaleDeviceDto;
  };
  'scale.reading': {
    payload: ScaleReadingDto;
  };
  'app.lifecycle': {
    payload: { state: 'background' | 'foreground' };
  };
};

export const RpcMethods = {
  healthAuthorize: 'health.authorize',
  healthReadSamples: 'health.readSamples',
  healthWriteWeight: 'health.writeWeight',
  scaleScan: 'scale.scan',
  scaleConnect: 'scale.connect',
  storageGet: 'storage.get',
  storageSet: 'storage.set',
  storageRemove: 'storage.remove',
  resourceFetch: 'resource.fetch',
  appGetInfo: 'app.getInfo',
  appGetCapabilities: 'app.getCapabilities',
  notificationSchedule: 'notification.schedule',
} as const satisfies Record<string, keyof LeanOnRpcContract>;

export const BridgeEvents = {
  healthAuthorizationChanged: 'health.authorizationChanged',
  scaleDiscovered: 'scale.discovered',
  scaleReading: 'scale.reading',
  appLifecycle: 'app.lifecycle',
} as const satisfies Record<string, keyof LeanOnEventContract>;
