import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export interface Environment { DB: D1Database; PHOTOS: R2Bucket }
export interface Ciphertext { algorithm: 'AES-256-GCM'; nonce: string; ciphertext: string; tag: string }
export interface ObjectReference { id: string; digest: string; size: number }
export interface Change {
  id: string; recordId: string; category: string; kind: 'record' | 'encouragement';
  updatedAt: number; deleted: boolean; payload: Ciphertext; objects?: ObjectReference[];
}
export interface StoredChange extends Change { ownerId: string; deviceId: string; sequence: number }
export interface Group {
  id: string; kind: 'vault' | 'family'; members: string[]; epoch: number;
  grants: Record<string, Record<string, string[]>>;
}
export interface Limits { controlBody: number; smallCipher: number; photo: number; changes: number; acks: number; objects: number; response: number; cleanup: number }
export const LIMITS: Readonly<Limits> = { controlBody: 512 * 1024, smallCipher: 128 * 1024, photo: 20 * 1024 * 1024 + 28, changes: 4, acks: 4, objects: 64, response: 512 * 1024, cleanup: 4 };
export const CATEGORIES: readonly string[] = ['goal', 'progress_band', 'checkin_streak', 'meals', 'photos', 'menstrual', 'exact_weight', 'body_measurements', 'encouragement'];
export class ProtocolError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
export function fail(status: number, code: string): never { throw new ProtocolError(status, code); }
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail(400, 'invalid_object');
}
export function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(400, 'unknown_field');
}
export function string(value: unknown, min = 1, max = 128): string {
  return typeof value === 'string' && value.length >= min && value.length <= max ? value : fail(400, 'invalid_string');
}
export function id(value: unknown): string {
  const result = string(value);
  return /^[A-Za-z0-9_-]+$/.test(result) && !['__proto__', 'constructor', 'prototype'].includes(result) ? result : fail(400, 'invalid_id');
}
export function integer(value: unknown, min: number = 0, max: number = Number.MAX_SAFE_INTEGER): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : fail(400, 'invalid_number');
}
export function binary(value: unknown, length?: number, max: number = LIMITS.smallCipher): string {
  const text = string(value, 0, Math.ceil((length ?? max) / 3) * 4);
  const bytes = Buffer.from(text, 'base64');
  if (bytes.toString('base64') !== text || (length !== undefined && bytes.length !== length)) fail(400, 'invalid_base64');
  if (bytes.length > max) fail(413, 'ciphertext_capacity');
  return text;
}
export function cipher(value: unknown): Ciphertext {
  const c = object(value); keys(c, ['algorithm', 'nonce', 'ciphertext', 'tag']);
  if (c.algorithm !== 'AES-256-GCM') fail(400, 'invalid_algorithm');
  return { algorithm: 'AES-256-GCM', nonce: binary(c.nonce, 12), ciphertext: binary(c.ciphertext), tag: binary(c.tag, 16) };
}
export function hex(value: unknown): string {
  const result = string(value, 64, 64); return /^[a-f0-9]{64}$/.test(result) ? result : fail(400, 'invalid_digest');
}
export function references(value: unknown): ObjectReference[] {
  if (!Array.isArray(value) || value.length > LIMITS.objects) fail(400, 'object_reference_capacity');
  const result = value.map(entry => { const o = object(entry); keys(o, ['id', 'digest', 'size']); return { id: id(o.id), digest: hex(o.digest), size: integer(o.size, 28, LIMITS.photo) }; });
  if (new Set(result.map(o => o.id)).size !== result.length || result.some((o, n) => n > 0 && o.id <= result[n - 1]!.id)) fail(400, 'object_reference_order');
  return result;
}
export function change(value: unknown): Change {
  const c = object(value); keys(c, ['id', 'recordId', 'category', 'kind', 'updatedAt', 'deleted', 'payload', 'objects']);
  if (c.kind !== 'record' && c.kind !== 'encouragement') fail(400, 'invalid_kind');
  if (typeof c.deleted !== 'boolean') fail(400, 'invalid_deleted');
  const result: Change = { id: id(c.id), recordId: id(c.recordId), category: id(c.category), kind: c.kind, updatedAt: integer(c.updatedAt), deleted: c.deleted, payload: cipher(c.payload) };
  if (c.objects !== undefined) result.objects = references(c.objects);
  if (result.kind === 'encouragement' && (result.category !== 'encouragement' || result.objects?.length)) fail(400, 'invalid_encouragement');
  if (result.deleted && result.objects?.length) fail(400, 'deleted_object_references');
  return result;
}
export const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
export const same = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const token = (): string => Buffer.from(randomBytes(32)).toString('base64url');
export function passwordKey(password: string, salt: string, p: 1 | 5 = 5): Promise<string> {
  return new Promise((resolve, reject) => scrypt(password, Buffer.from(salt, 'hex'), 64, { N: 16384, r: 8, p, maxmem: 32 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(Buffer.from(key).toString('hex'))));
}
export function loginName(value: unknown): string {
  const result = string(value, 3, 200).trim().toLowerCase();
  return result.length >= 3 && !/[\u0000-\u0020\u007f]/.test(result) ? result : fail(400, 'invalid_login');
}
export async function body(request: Request, max: number = LIMITS.controlBody): Promise<Record<string, unknown>> {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > max)) fail(413, 'request_capacity');
  if (!request.body) return {};
  const reader = request.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > max) fail(413, 'request_capacity'); parts.push(part.value); }
  } finally { await reader.cancel(); }
  if (!size) return {};
  try { return object(JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown); }
  catch (error) { if (error instanceof ProtocolError) throw error; return fail(400, 'invalid_json'); }
}
export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
