import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { constants } from 'node:fs';
import { lstat, realpath, open, mkdir, readFile, link, unlink, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { exportBackup, exportDeletionFloor, migrateLegacy, planLegacyMigration, restoreBackup, type Backup } from './admin.js';
import { LIMITS, type Ciphertext, type Environment } from './protocol.js';

export const LOCAL_ADMIN_COMMANDS: readonly string[] = ['init', 'backup', 'deletion-floor', 'restore', 'migration-plan', 'migration-stage'];
export type LocalAdminCommand = 'init' | 'backup' | 'deletion-floor' | 'restore' | 'migration-plan' | 'migration-stage';
export interface LocalAdminConfig {
  version: 1; syntheticOnly: true; quiesced: true; workspace: string;
  paths: { sourceState: string; targetState: string; operatorKey: string; backup: string; deletionFloor: string; legacySource: string };
  migration: { targetOrigin: string; targetServiceId: string; operationId: string };
}
export interface LocalAdminInvocation { command: LocalAdminCommand; configPath: string; execute: boolean }
export interface LocalAdminSummary {
  ok: true; command: LocalAdminCommand; mode: 'dry-run' | 'local-execute'; syntheticOnly: true;
  authentication: 'not-performed' | 'verified-by-admin-core' | 'not-applicable';
  databaseChecks: 'not-performed' | 'local-bindings-opened';
  accounts?: number; approvedDevices?: number; groups?: number; oldRecordsCopied?: number;
  republishGroups?: number; restoredAccounts?: number; fencedObjects?: number; objects?: number;
  sourceServiceId?: string; targetServiceId?: string;
}
type ErrorCode = 'invalid_arguments' | 'invalid_config' | 'unsafe_workspace' | 'unsafe_path' | 'invalid_input' | 'output_exists' | 'workspace_busy' | 'target_identity_mismatch' | 'local_operation_failed';
export class LocalAdminError extends Error {
  constructor(public readonly code: ErrorCode) { super(code); }
}
function refuse(code: ErrorCode): never { throw new LocalAdminError(code); }
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return refuse('invalid_config');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).sort().join('|') !== [...fields].sort().join('|')) return refuse('invalid_config');
  return result;
}
function relativePath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 240 || !/^[a-zA-Z0-9._/-]+$/.test(value) || isAbsolute(value) || value.split('/').some(p => !p || p === '.' || p === '..')) return refuse('unsafe_path');
  return value;
}
function overlaps(a: string, b: string): boolean { return a === b || a.startsWith(b + '/') || b.startsWith(a + '/'); }
export function validateLocalAdminConfig(value: unknown): LocalAdminConfig {
  const c = record(value, ['version', 'syntheticOnly', 'quiesced', 'workspace', 'paths', 'migration']);
  if (c.version !== 1 || c.syntheticOnly !== true || c.quiesced !== true || typeof c.workspace !== 'string' || !isAbsolute(c.workspace) || resolve(c.workspace) !== c.workspace || !/^leanon-admin-synthetic-[a-z0-9-]+$/.test(basename(c.workspace))) return refuse('invalid_config');
  const p = record(c.paths, ['sourceState', 'targetState', 'operatorKey', 'backup', 'deletionFloor', 'legacySource']);
  const paths = { sourceState: relativePath(p.sourceState), targetState: relativePath(p.targetState), operatorKey: relativePath(p.operatorKey), backup: relativePath(p.backup), deletionFloor: relativePath(p.deletionFloor), legacySource: relativePath(p.legacySource) };
  const all = Object.values(paths);
  const independentDirectories = [dirname(paths.operatorKey), dirname(paths.backup), dirname(paths.deletionFloor)];
  if (all.some((path, index) => all.slice(index + 1).some(other => overlaps(path, other))) || independentDirectories.includes('.') || independentDirectories.some((path, index) => independentDirectories.slice(index + 1).some(other => overlaps(path, other))) || all.some(path => path.split('/').some(part => part.startsWith('.local-admin')))) return refuse('unsafe_path');
  const m = record(c.migration, ['targetOrigin', 'targetServiceId', 'operationId']);
  if (typeof m.targetOrigin !== 'string' || typeof m.targetServiceId !== 'string' || !/^[a-f0-9]{64}$/.test(m.targetServiceId) || typeof m.operationId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(m.operationId)) return refuse('invalid_config');
  let url: URL; try { url = new URL(m.targetOrigin); } catch { return refuse('invalid_config'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return refuse('invalid_config');
  return { version: 1, syntheticOnly: true, quiesced: true, workspace: c.workspace, paths, migration: { targetOrigin: url.origin, targetServiceId: m.targetServiceId, operationId: m.operationId } };
}
export function parseLocalAdminArguments(args: readonly string[]): LocalAdminInvocation {
  if (![3, 4].includes(args.length) || !LOCAL_ADMIN_COMMANDS.includes(args[0] ?? '') || args[1] !== '--config' || !args[2] || (args.length === 4 && !['--dry-run', '--local-execute'].includes(args[3]!))) return refuse('invalid_arguments');
  if (args[0] === 'migration-plan' && args[3] === '--local-execute') return refuse('invalid_arguments');
  return { command: args[0] as LocalAdminCommand, configPath: args[2], execute: args[3] === '--local-execute' };
}
async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
/** Reject symlinks in every workspace-relative component, including missing output parents. */
async function scopedPath(workspace: string, relative: string): Promise<string> {
  let path = workspace;
  for (const part of relative.split('/')) {
    path = join(path, part);
    try { if ((await lstat(path)).isSymbolicLink()) return refuse('unsafe_path'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return path;
}
async function boundedRead(path: string, limit: number): Promise<Buffer> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat(); if (!info.isFile() || info.size > limit) return refuse('invalid_input');
    const bytes = Buffer.alloc(info.size + 1); const read = await handle.read(bytes, 0, bytes.length, 0);
    if (read.bytesRead !== info.size) return refuse('invalid_input');
    return bytes.subarray(0, info.size);
  } finally { await handle.close(); }
}
async function jsonFile(path: string, limit: number): Promise<unknown> {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(await boundedRead(path, limit))) as unknown; }
  catch (error) { if (error instanceof LocalAdminError) throw error; return refuse('invalid_input'); }
}
async function workspace(config: LocalAdminConfig, initialize: boolean): Promise<string> {
  const parent = await realpath(dirname(config.workspace));
  const temporaryParents = await Promise.all([realpath(tmpdir()), realpath('/tmp')]);
  if (!temporaryParents.includes(parent)) return refuse('unsafe_workspace');
  const root = join(parent, basename(config.workspace));
  if (await exists(root)) {
    const info = await lstat(root);
    if (info.isSymbolicLink() || !info.isDirectory() || (info.mode & 0o077) !== 0 || initialize) return refuse('unsafe_workspace');
    const marker = record(await jsonFile(join(root, '.local-admin-workspace.json'), 1024), ['version', 'syntheticOnly']);
    if (marker.version !== 1 || marker.syntheticOnly !== true) return refuse('unsafe_workspace');
  } else if (!initialize) return refuse('unsafe_workspace');
  return root;
}
async function writeNew(path: string, bytes: string): Promise<void> {
  if (Buffer.byteLength(bytes) > 64 * 1024 * 1024) return refuse('invalid_input');
  if (await exists(path)) return refuse('output_exists');
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(path), '.local-admin-output-' + randomUUID());
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    // Link publishes a complete file atomically and cannot overwrite a concurrent output.
    await link(temporary, path);
  } finally { await unlink(temporary).catch(() => undefined); }
}
function base64(value: unknown, maximum: number, exact?: number): Buffer {
  if (typeof value !== 'string' || value.length > Math.ceil(maximum / 3) * 4) return refuse('invalid_input');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || bytes.length > maximum || (exact !== undefined && bytes.length !== exact)) return refuse('invalid_input');
  return bytes;
}
function envelope(value: unknown): Ciphertext {
  const c = record(value, ['algorithm', 'nonce', 'ciphertext', 'tag']);
  if (c.algorithm !== 'AES-256-GCM') return refuse('invalid_input');
  base64(c.nonce, 12, 12); base64(c.tag, 16, 16); base64(c.ciphertext, 16 * 1024 * 1024);
  return { algorithm: 'AES-256-GCM', nonce: c.nonce as string, ciphertext: c.ciphertext as string, tag: c.tag as string };
}
export function decodeLocalBackup(value: unknown): Backup {
  const b = record(value, ['version', 'manifest', 'objects']);
  if (b.version !== 1 || !Array.isArray(b.objects) || b.objects.length > 64) return refuse('invalid_input');
  const objects = b.objects.map(value => {
    const o = record(value, ['key', 'bytes']);
    if (typeof o.key !== 'string' || !/^v2\/[A-Za-z0-9_-]{1,128}$/.test(o.key)) return refuse('invalid_input');
    return { key: o.key, bytes: base64(o.bytes, LIMITS.photo) };
  });
  if (new Set(objects.map(o => o.key)).size !== objects.length) return refuse('invalid_input');
  return { manifest: envelope(b.manifest), objects };
}
export interface LocalAdminBinding { env: Environment; dispose(): Promise<void> }
export type LocalAdminFactory = (stateDirectory: string, initialize: boolean) => Promise<LocalAdminBinding>;
export async function openLocalAdminBinding(stateDirectory: string, initialize: boolean): Promise<LocalAdminBinding> {
  const { Miniflare, convertV4MiniflareOptions, Response, Log, LogLevel } = await import('miniflare');
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const packageDirectory = resolve(moduleDirectory, '..');
  const mf = new Miniflare({ ...convertV4MiniflareOptions({ host: '127.0.0.1', port: 0, scriptPath: join(packageDirectory, 'dist/worker.js'), modules: true, compatibilityDate: '2026-10-07', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['PHOTOS'], telemetry: { enabled: false }, outboundService: () => new Response('Local admin refuses outbound access', { status: 403 }) }), resourcePersistencePath: stateDirectory, log: new Log(LogLevel.NONE) });
  try {
    const DB = await mf.getD1Database('DB') as unknown as D1Database;
    const PHOTOS = await mf.getR2Bucket('PHOTOS') as unknown as R2Bucket;
    if (initialize) {
      const schema = await readFile(join(packageDirectory, 'migrations/0001-private-relay.sql'), 'utf8');
      await DB.batch(schema.split(';').map(s => s.trim()).filter(Boolean).map(s => DB.prepare(s)));
    } else if (!(await DB.prepare('SELECT id FROM meta WHERE id = 1').first())) return refuse('invalid_input');
    return { env: { DB, PHOTOS }, dispose: () => mf.dispose() };
  } catch (error) { await mf.dispose(); throw error; }
}
/** The only executable backend is a marked temporary synthetic workspace. Dry-run never opens it. */
export async function runLocalAdmin(invocation: LocalAdminInvocation, factory: LocalAdminFactory = openLocalAdminBinding): Promise<LocalAdminSummary> {
  const config = validateLocalAdminConfig(await jsonFile(invocation.configPath, 64 * 1024));
  const root = await workspace(config, invocation.command === 'init');
  const paths = { ...config.paths };
  for (const key of Object.keys(paths) as (keyof typeof paths)[]) paths[key] = await scopedPath(root, config.paths[key]);
  const summary: LocalAdminSummary = { ok: true, command: invocation.command, mode: invocation.execute ? 'local-execute' : 'dry-run', syntheticOnly: true, authentication: 'not-applicable', databaseChecks: 'not-performed' };
  if (invocation.command !== 'init') {
    for (const state of [paths.sourceState, paths.targetState]) {
      if (!(await exists(state)) || !(await lstat(state)).isDirectory()) return refuse('invalid_input');
      const marker = record(await jsonFile(join(state, '.local-admin-state.json'), 1024), ['version', 'syntheticOnly']);
      if (marker.version !== 1 || marker.syntheticOnly !== true) return refuse('invalid_input');
    }
  }
  let key: Buffer | undefined; let backup: Backup | undefined; let floor: Ciphertext | undefined; let legacy: unknown;
  try {
    if (['backup', 'deletion-floor', 'restore'].includes(invocation.command)) {
      key = await boundedRead(paths.operatorKey, 32); if (key.length !== 32) return refuse('invalid_input');
      if ((await lstat(paths.operatorKey)).mode & 0o077) return refuse('invalid_input');
    }
    if (['backup', 'deletion-floor'].includes(invocation.command) && await exists(invocation.command === 'backup' ? paths.backup : paths.deletionFloor)) return refuse('output_exists');
    if (invocation.command === 'restore') {
      backup = decodeLocalBackup(await jsonFile(paths.backup, 64 * 1024 * 1024));
      floor = envelope(await jsonFile(paths.deletionFloor, 24 * 1024 * 1024));
      summary.objects = backup.objects.length; summary.authentication = 'not-performed';
    }
    if (['migration-plan', 'migration-stage'].includes(invocation.command)) {
      legacy = await jsonFile(paths.legacySource, 16 * 1024 * 1024);
      const plan = planLegacyMigration(legacy, config.migration.targetOrigin, config.migration.targetServiceId, config.migration.operationId);
      summary.accounts = plan.accounts; summary.approvedDevices = plan.approvedDevices; summary.groups = plan.groups; summary.oldRecordsCopied = plan.oldRecordsCopied;
    }
    if (!invocation.execute) return summary;
    if (invocation.command === 'init') {
      await mkdir(root, { mode: 0o700 });
      try {
        await writeNew(join(root, '.local-admin-workspace.json'), JSON.stringify({ version: 1, syntheticOnly: true }));
        for (const [path, field] of [[paths.sourceState, 'sourceServiceId'], [paths.targetState, 'targetServiceId']] as const) {
          await mkdir(path, { recursive: true, mode: 0o700 });
          const binding = await factory(path, true);
          summary.databaseChecks = 'local-bindings-opened';
          try { summary[field] = await binding.env.DB.prepare('SELECT identifier FROM service_identity WHERE id = 1').first<string>('identifier') ?? undefined; }
          finally { await binding.dispose(); }
          await writeNew(join(path, '.local-admin-state.json'), JSON.stringify({ version: 1, syntheticOnly: true }));
        }
      } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
      return summary;
    }
    const lockPath = join(root, '.local-admin.lock');
    let lock;
    try { lock = await open(lockPath, 'wx', 0o600); } catch { return refuse('workspace_busy'); }
    try {
      // A hard-killed operator leaves a lock and refuses further execution until its owner inspects it.
      await lock.writeFile(JSON.stringify({ pid: process.pid }));
      const target = ['restore', 'migration-stage'].includes(invocation.command);
      const state = target ? paths.targetState : paths.sourceState;
      if (!(await exists(state)) || !(await lstat(state)).isDirectory()) return refuse('invalid_input');
      const binding = await factory(state, false);
      summary.databaseChecks = 'local-bindings-opened';
      try {
        if (invocation.command === 'backup') {
          const result = await exportBackup(binding.env, key!); summary.objects = result.objects.length;
          if (result.objects.length > 64 || result.objects.reduce((size, item) => size + item.bytes.byteLength, 0) > 48 * 1024 * 1024 || new Set(result.objects.map(item => item.key)).size !== result.objects.length || result.objects.some(item => !/^v2\/[A-Za-z0-9_-]{1,128}$/.test(item.key))) return refuse('invalid_input');
          envelope(result.manifest);
          await writeNew(paths.backup, JSON.stringify({ version: 1, manifest: result.manifest, objects: result.objects.map(o => ({ key: o.key, bytes: Buffer.from(o.bytes).toString('base64') })) }));
        } else if (invocation.command === 'deletion-floor') {
          await writeNew(paths.deletionFloor, JSON.stringify(await exportDeletionFloor(binding.env, key!)));
        } else if (invocation.command === 'restore') {
          const result = await restoreBackup(binding.env, backup!, floor!, key!);
          summary.restoredAccounts = result.restoredAccounts; summary.fencedObjects = result.fencedObjects; summary.authentication = 'verified-by-admin-core';
        } else if (invocation.command === 'migration-stage') {
          const identity = await binding.env.DB.prepare('SELECT identifier FROM service_identity WHERE id = 1').first<string>('identifier');
          if (identity !== config.migration.targetServiceId) return refuse('target_identity_mismatch');
          const result = await migrateLegacy(binding.env.DB, legacy, { operationId: config.migration.operationId });
          summary.accounts = result.accounts; summary.republishGroups = result.republishGroups.length;
        }
      } finally { await binding.dispose(); }
    } finally { await lock.close(); await unlink(lockPath); }
    return summary;
  } finally { key?.fill(0); }
}
export interface LocalAdminCliResult { exitCode: 0 | 1; stdout: string; stderr: string }
export async function runLocalAdminCli(args: readonly string[], factory: LocalAdminFactory = openLocalAdminBinding): Promise<LocalAdminCliResult> {
  try { return { exitCode: 0, stdout: JSON.stringify(await runLocalAdmin(parseLocalAdminArguments(args), factory)) + '\n', stderr: '' }; }
  catch (error) {
    const code = error instanceof LocalAdminError ? error.code : 'local_operation_failed';
    return { exitCode: 1, stdout: '', stderr: JSON.stringify({ ok: false, error: code }) + '\n' };
  }
}
