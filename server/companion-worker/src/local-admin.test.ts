import { afterEach, beforeEach, describe, expect, it } from '@rstest/core';
import { createCipheriv, createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, lstat, symlink, writeFile, truncate, chmod } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCompanionServer } from '@zzzode/companion-server';
import { openLocalAdminBinding, runLocalAdminCli, validateLocalAdminConfig, type LocalAdminBinding, type LocalAdminConfig, type LocalAdminFactory, type LocalAdminSummary } from './local-admin.js';
import { hash } from './protocol.js';
import { sql } from './database.js';
import { worker } from './worker.js';

const password = 'PUBLIC synthetic local-admin password', proof = Buffer.alloc(32, 81).toString('base64');
describe('synthetic-only operator entry, default preview and isolated D1/R2 execution', () => {
  let container: string, configPath: string, config: LocalAdminConfig;
  beforeEach(async () => {
    container = await mkdtemp(join(tmpdir(), 'leanon-admin-test-'));
    configPath = join(container, 'config.json');
    config = validateLocalAdminConfig({ version: 1, syntheticOnly: true, quiesced: true, workspace: join(tmpdir(), 'leanon-admin-synthetic-' + randomUUID()),
      paths: { sourceState: 'state/source', targetState: 'state/target', operatorKey: 'keys/public.bin', backup: 'backups/snapshot.json', deletionFloor: 'floors/latest.json', legacySource: 'inputs/legacy.json' },
      migration: { targetOrigin: 'http://127.0.0.1:64043', targetServiceId: '0'.repeat(64), operationId: 'PUBLIC-local-cutover' } });
    await save();
  });
  afterEach(async () => { await rm(config.workspace, { recursive: true, force: true }); await rm(container, { recursive: true, force: true }); });
  async function save(): Promise<void> { await writeFile(configPath, JSON.stringify(config)); }
  async function cli(command: string, execute = true, factory?: LocalAdminFactory): Promise<LocalAdminSummary> {
    await save();
    const result = await runLocalAdminCli([command, '--config', configPath, ...(execute ? ['--local-execute'] : [])], factory);
    expect(result.stderr).toBe(''); expect(result.exitCode).toBe(0);
    return JSON.parse(result.stdout) as LocalAdminSummary;
  }
  async function initialize(): Promise<void> {
    const result = await cli('init'); config.migration.targetServiceId = result.targetServiceId!; await save();
    await mkdir(join(config.workspace, 'keys')); await writeFile(join(config.workspace, config.paths.operatorKey), Buffer.alloc(32, 47), { mode: 0o600 });
  }
  async function binding(target = true): Promise<LocalAdminBinding> { return openLocalAdminBinding(join(config.workspace, target ? config.paths.targetState : config.paths.sourceState), false); }
  async function snapshot(path: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    async function visit(directory: string): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const p = join(directory, entry.name);
        if (entry.isDirectory()) await visit(p);
        else { const stat = await lstat(p); result[p] = createHash('sha256').update(await readFile(p)).digest('hex') + ':' + stat.mtimeMs; }
      }
    }
    await visit(path); return result;
  }
  async function legacy(): Promise<{ accountId: string; vaultId: string }> {
    const file = join(config.workspace, config.paths.legacySource); await mkdir(join(config.workspace, 'inputs'));
    const relay = await createCompanionServer({ file, port: 0 });
    try {
      const registered = await fetch(relay.url + '/v1/accounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'local-owner', password, deviceId: 'public-phone', deviceProof: proof }) });
      expect(registered.status).toBe(200);
      const a = await registered.json() as { accountId: string; vaultId: string; token: string };
      const nonce = Buffer.alloc(12, 82), cipher = createCipheriv('aes-256-gcm', Buffer.alloc(32, 83), nonce);
      const payload = { algorithm: 'AES-256-GCM', nonce: nonce.toString('base64'), ciphertext: Buffer.concat([cipher.update('PUBLIC fictional old aggregate'), cipher.final()]).toString('base64'), tag: Buffer.from(cipher.getAuthTag()).toString('base64') };
      const synced = await fetch(relay.url + `/v1/groups/${a.vaultId}/sync`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + a.token }, body: JSON.stringify({ epoch: 1, cursor: 0, changes: [{ id: 'public-old-change', recordId: 'public-old-vault', category: 'vault', kind: 'record', updatedAt: 1, deleted: false, payload }], acks: [] }) });
      expect(synced.status).toBe(200); return a;
    } finally { await relay.close(); }
  }
  async function stageAndSwap(extraDevices = 0): Promise<{ accountId: string; vaultId: string; packet: Uint8Array }> {
    await initialize(); const a = await legacy(); const before = await readFile(join(config.workspace, config.paths.legacySource));
    expect(await cli('migration-plan', false)).toMatchObject({ mode: 'dry-run', accounts: 1, oldRecordsCopied: 0 });
    expect(await cli('migration-stage')).toMatchObject({ accounts: 1, republishGroups: 1 });
    expect(await readFile(join(config.workspace, config.paths.legacySource))).toEqual(before);
    const b = await binding();
    const nonce = Buffer.alloc(12, 84), cipher = createCipheriv('aes-256-gcm', Buffer.alloc(32, 85), nonce);
    const encrypted = Buffer.concat([cipher.update('PUBLIC fictional independent photo'), cipher.final()]);
    const packet = Buffer.concat([nonce, Buffer.from(cipher.getAuthTag()), encrypted]);
    try {
      await b.env.PHOTOS.put('v2/public-object', packet);
      await sql(b.env.DB, "INSERT INTO photo_objects VALUES ('public-object', ?, 2, ?, 'public-phone', ?, ?, 'ready', 0)", a.vaultId, a.accountId, hash(packet), packet.length).run();
      for (let index = 0; index < extraDevices; index++) await sql(b.env.DB, 'INSERT INTO devices VALUES (?, ?, ?)', a.accountId, 'extra-' + index, hash(proof)).run();
    } finally { await b.dispose(); }
    [config.paths.sourceState, config.paths.targetState] = [config.paths.targetState, config.paths.sourceState]; await save();
    return { ...a, packet };
  }
  it('the independent checked-in template previews initialization without bindings or writes', async () => {
    const template: unknown = JSON.parse(await readFile(join(process.cwd(), 'templates/local-admin.example.json'), 'utf8'));
    expect(validateLocalAdminConfig(template).syntheticOnly).toBe(true);
    let calls = 0;
    expect(await cli('init', false, async () => { calls++; throw new Error('Must never open'); })).toMatchObject({ mode: 'dry-run', databaseChecks: 'not-performed' });
    expect(calls).toBe(0); await expect(lstat(config.workspace)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('the actual built command wrapper defaults to dry-run and emits only its bounded JSON summary', async () => {
    const result = await promisify(execFile)(process.execPath, ['scripts/local-admin.mjs', 'init', '--config', configPath], { cwd: process.cwd() });
    expect(result.stderr).toBe(''); expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, mode: 'dry-run', databaseChecks: 'not-performed' });
    await expect(lstat(config.workspace)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it.each([
    ['unknown secret field', { apiToken: 'PUBLIC-must-not-be-printed' }], ['wrong version', { version: 2 }], ['real-data mode', { syntheticOnly: false }], ['unquiesced', { quiesced: false }], ['non-temporary root', { workspace: '/Users/operator/leanon-admin-synthetic-data' }],
  ])('rejects %s without echoing configuration', async (_name, changed) => {
    await writeFile(configPath, JSON.stringify({ ...config, ...changed }));
    const result = await runLocalAdminCli(['init', '--config', configPath]);
    expect(result.exitCode).toBe(1); expect(result.stdout).toBe(''); expect(result.stderr).not.toContain('PUBLIC-must-not-be-printed');
  });
  it.each(['https://remote.invalid', 'http://remote.invalid', 'http://10.0.2.2:64043', 'http://user:PUBLIC-secret@127.0.0.1:64043', 'http://127.0.0.1:64043/path', 'http://127.0.0.1:64043?token=PUBLIC-secret'])('refuses nonlocal or credential-bearing origin %s', async origin => {
    config.migration.targetOrigin = origin; await save();
    const result = await runLocalAdminCli(['init', '--config', configPath]); expect(result.exitCode).toBe(1); expect(result.stderr).not.toContain('PUBLIC-secret');
  });
  it.each(['../records.json', '/tmp/records.json', 'files//record.json', 'files/./record.json', 'state/source/health.json', 'floors/../snapshot.json', 'backups/latest.json'])('rejects traversing/overlapping floor path %s', async path => {
    config.paths.deletionFloor = path; await save(); expect((await runLocalAdminCli(['init', '--config', configPath])).exitCode).toBe(1);
  });
  it.each(['--execute', '--remote', '--deploy', '--account-id', '--local-execute --remote'])('rejects unsafe execution argument %s', async flag => {
    const result = await runLocalAdminCli(['init', '--config', configPath, flag]); expect(result.exitCode).toBe(1); expect(result.stderr).toContain('invalid_arguments');
  });
  it('rejects wrong nested templates, service IDs, operations and overlapping state', () => {
    for (const migration of [{ ...config.migration, targetServiceId: 'wrong' }, { ...config.migration, operationId: '../unsafe' }, { ...config.migration, password: 'PUBLIC-secret' }]) expect(() => validateLocalAdminConfig({ ...config, migration })).toThrow();
    expect(() => validateLocalAdminConfig({ ...config, paths: { ...config.paths, targetState: config.paths.sourceState } })).toThrow();
    expect(() => validateLocalAdminConfig({ ...config, paths: { ...config.paths, operatorKey: 'backups/key.bin' } })).toThrow();
    expect(() => validateLocalAdminConfig({ ...config, paths: { ...config.paths, deletionFloor: 'keys/floor.json' } })).toThrow();
  });
  it('default dry-run has no D1/R2/filesystem writes and states that restore authentication was not done', async () => {
    await stageAndSwap(); await cli('backup'); await cli('deletion-floor'); const before = await snapshot(config.workspace);
    let opened = 0;
    const result = await cli('restore', false, async () => { opened++; throw new Error('Must not open'); });
    expect(result).toMatchObject({ mode: 'dry-run', authentication: 'not-performed', databaseChecks: 'not-performed', objects: 1 });
    expect(opened).toBe(0); expect(await snapshot(config.workspace)).toEqual(before);
  });
  it('uses actual D1/R2 backup, separately authenticated floor and empty-target restore, without live sessions', async () => {
    const a = await stageAndSwap(); await cli('backup'); await cli('deletion-floor');
    const result = await cli('restore'); expect(result).toMatchObject({ restoredAccounts: 1, fencedObjects: 0, authentication: 'verified-by-admin-core' });
    expect(result).not.toHaveProperty('password');
    const b = await binding();
    try {
      expect(await b.env.DB.prepare('SELECT count(*) AS n FROM accounts').first('n')).toBe(1);
      expect(await b.env.DB.prepare('SELECT count(*) AS n FROM sessions').first('n')).toBe(0);
      expect(new Uint8Array(await (await b.env.PHOTOS.get('v2/public-object'))!.arrayBuffer())).toEqual(new Uint8Array(a.packet));
    } finally { await b.dispose(); }
    expect((await runLocalAdminCli(['restore', '--config', configPath, '--local-execute'])).exitCode).toBe(1);
  });
  it('protects ACKed deletion when restoring an older snapshot with the latest separately retained floor', async () => {
    await stageAndSwap(); await cli('backup');
    const b = await binding(false);
    try {
      const login = await worker.fetch(new Request('http://localhost/v1/sessions', { method: 'POST', body: JSON.stringify({ login: 'local-owner', password, deviceId: 'public-phone', deviceProof: proof }) }), b.env);
      expect(login.status).toBe(200); const session = await login.json() as { token: string };
      const deletionProof = Buffer.alloc(32, 86).toString('base64');
      const deleted = await worker.fetch(new Request('http://localhost/v1/accounts/current', { method: 'DELETE', headers: { authorization: 'Bearer ' + session.token }, body: JSON.stringify({ password, operationId: 'PUBLIC-delete', proof: deletionProof }) }), b.env); expect(deleted.status).toBe(200);
      const ack = await worker.fetch(new Request('http://localhost/v1/account-deletions/PUBLIC-delete/ack', { method: 'POST', body: JSON.stringify({ proof: deletionProof }) }), b.env); expect(ack.status).toBe(200);
    } finally { await b.dispose(); }
    await cli('deletion-floor'); expect(await cli('restore')).toMatchObject({ restoredAccounts: 0, fencedObjects: 1 });
    const target = await binding();
    try { expect(await target.env.DB.prepare('SELECT count(*) AS n FROM accounts').first('n')).toBe(0); expect((await target.env.PHOTOS.get('v2/public-object'))!.size).toBe(0); }
    finally { await target.dispose(); }
  });
  it('fails closed on an interrupted actual D1 import, clears its invocation lock and retries only authenticated identical input', async () => {
    await stageAndSwap(100); await cli('backup'); await cli('deletion-floor');
    const interrupted: LocalAdminFactory = async (path, init) => {
      const b = await openLocalAdminBinding(path, init); let calls = 0;
      const DB = new Proxy(b.env.DB, { get(db, name) {
        if (name === 'batch') return async (statements: D1PreparedStatement[]) => { if (++calls === 3) throw new Error('PUBLIC secret injected write failure'); return db.batch(statements); };
        const member: unknown = Reflect.get(db, name); return typeof member === 'function' ? member.bind(db) : member;
      } });
      return { env: { DB, PHOTOS: b.env.PHOTOS }, dispose: b.dispose };
    };
    const failed = await runLocalAdminCli(['restore', '--config', configPath, '--local-execute'], interrupted);
    expect(failed.exitCode).toBe(1); expect(failed.stderr).not.toContain('secret');
    await expect(lstat(join(config.workspace, '.local-admin.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
    const b = await binding();
    try { expect((await worker.fetch(new Request('http://localhost/health'), b.env)).status).toBe(503); }
    finally { await b.dispose(); }
    expect(await cli('restore')).toMatchObject({ restoredAccounts: 1 });
    const complete = await binding();
    try { expect(await complete.env.DB.prepare('SELECT count(*) AS n FROM devices').first('n')).toBe(101); expect((await worker.fetch(new Request('http://localhost/health'), complete.env)).status).toBe(200); }
    finally { await complete.dispose(); }
  });
  it('refuses symlink inputs/outputs, wrong keys, duplicate objects, and leaves no output on export failure', async () => {
    await stageAndSwap();
    const outside = join(container, 'outside'); await mkdir(outside); await symlink(outside, join(config.workspace, 'backups'));
    expect((await runLocalAdminCli(['backup', '--config', configPath, '--local-execute'])).exitCode).toBe(1);
    expect(await readdir(outside)).toEqual([]); await unlinkSafe(join(config.workspace, 'backups'));
    const failed: LocalAdminFactory = async (path, init) => { const b = await openLocalAdminBinding(path, init); return { env: { DB: b.env.DB, PHOTOS: new Proxy(b.env.PHOTOS, { get(bucket, name) { if (name === 'list') return () => { throw new Error('PUBLIC private ciphertext diagnostic'); }; const member: unknown = Reflect.get(bucket, name); return typeof member === 'function' ? member.bind(bucket) : member; } }) }, dispose: b.dispose }; };
    const error = await runLocalAdminCli(['backup', '--config', configPath, '--local-execute'], failed); expect(error.exitCode).toBe(1); expect(error.stderr).not.toContain('ciphertext');
    await expect(lstat(join(config.workspace, config.paths.backup))).rejects.toMatchObject({ code: 'ENOENT' });
    await cli('backup'); await cli('deletion-floor');
    const original = await readFile(join(config.workspace, config.paths.operatorKey)); await writeFile(join(config.workspace, config.paths.operatorKey), Buffer.alloc(32, 99));
    expect((await runLocalAdminCli(['restore', '--config', configPath, '--local-execute'])).exitCode).toBe(1); await writeFile(join(config.workspace, config.paths.operatorKey), original);
    const input = JSON.parse(await readFile(join(config.workspace, config.paths.backup), 'utf8')) as { objects: unknown[] }; input.objects.push(input.objects[0]); await writeFile(join(config.workspace, config.paths.backup), JSON.stringify(input));
    expect((await runLocalAdminCli(['restore', '--config', configPath])).exitCode).toBe(1);
    const b = await binding(); try { expect(await b.env.DB.prepare('SELECT count(*) AS n FROM accounts').first('n')).toBe(0); expect((await b.env.PHOTOS.list()).objects).toHaveLength(0); } finally { await b.dispose(); }
  });
  it('refuses a mismatched target identity, output replacement, existing workspace and retained process lock', async () => {
    await initialize(); await legacy(); config.migration.targetServiceId = 'a'.repeat(64); await save();
    expect((await runLocalAdminCli(['migration-stage', '--config', configPath, '--local-execute'])).stderr).toContain('target_identity_mismatch');
    const b = await binding(); try { expect(await b.env.DB.prepare('SELECT count(*) AS n FROM accounts').first('n')).toBe(0); } finally { await b.dispose(); }
    expect((await runLocalAdminCli(['init', '--config', configPath, '--local-execute'])).exitCode).toBe(1);
    await writeFile(join(config.workspace, '.local-admin.lock'), 'PUBLIC previous process lock');
    expect((await runLocalAdminCli(['backup', '--config', configPath, '--local-execute'])).stderr).toContain('workspace_busy');
    await unlinkSafe(join(config.workspace, '.local-admin.lock')); await cli('backup');
    const before = await readFile(join(config.workspace, config.paths.backup));
    expect((await runLocalAdminCli(['backup', '--config', configPath, '--local-execute'])).stderr).toContain('output_exists');
    expect(await readFile(join(config.workspace, config.paths.backup))).toEqual(before);
  });
  it('refuses malformed/symlink/oversized inputs and permissive key files before opening bindings', async () => {
    await initialize(); await legacy();
    let calls = 0; const forbidden: LocalAdminFactory = async () => { calls++; throw new Error('PUBLIC must never open'); };
    const file = join(config.workspace, config.paths.legacySource), original = await readFile(file), outside = join(container, 'public-outside.json');
    await writeFile(outside, original); await unlinkSafe(file); await symlink(outside, file);
    expect((await runLocalAdminCli(['migration-plan', '--config', configPath], forbidden)).exitCode).toBe(1);
    await unlinkSafe(file); await writeFile(file, '{malformed PUBLIC-secret');
    const failed = await runLocalAdminCli(['migration-plan', '--config', configPath], forbidden); expect(failed.exitCode).toBe(1); expect(failed.stderr).not.toContain('PUBLIC-secret');
    await truncate(file, 16 * 1024 * 1024 + 1); expect((await runLocalAdminCli(['migration-plan', '--config', configPath], forbidden)).exitCode).toBe(1);
    const key = join(config.workspace, config.paths.operatorKey); await chmod(key, 0o644);
    expect((await runLocalAdminCli(['backup', '--config', configPath], forbidden)).exitCode).toBe(1); await chmod(key, 0o600); await writeFile(key, Buffer.alloc(31, 1));
    expect((await runLocalAdminCli(['backup', '--config', configPath], forbidden)).exitCode).toBe(1); expect(calls).toBe(0);
  });
  it('refuses an export beyond its restorable object bound before publishing a snapshot', async () => {
    await stageAndSwap(); const source = await binding(false);
    try { for (let index = 0; index < 64; index++) await source.env.PHOTOS.put('v2/public-orphan-' + index, new Uint8Array(0), { customMetadata: { state: 'revoked' } }); }
    finally { await source.dispose(); }
    const result = await runLocalAdminCli(['backup', '--config', configPath, '--local-execute']);
    expect(result.exitCode).toBe(1); expect(result.stderr).toContain('invalid_input');
    await expect(lstat(join(config.workspace, config.paths.backup))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('rejects tampered and missing ciphertext and an authenticated stale floor before importing any target data', async () => {
    await stageAndSwap(); await cli('deletion-floor');
    const source = await binding(false);
    try { await source.env.DB.prepare('UPDATE meta SET revision = revision + 1 WHERE id = 1').run(); }
    finally { await source.dispose(); }
    await cli('backup');
    const oldFloor = await readFile(join(config.workspace, config.paths.deletionFloor));
    expect((await runLocalAdminCli(['restore', '--config', configPath, '--local-execute'])).exitCode).toBe(1);
    await unlinkSafe(join(config.workspace, config.paths.deletionFloor)); await cli('deletion-floor');
    const file = join(config.workspace, config.paths.backup), original = await readFile(file, 'utf8');
    for (const missing of [false, true]) {
      const input = JSON.parse(original) as { objects: { key: string; bytes: string }[] };
      if (missing) input.objects = [];
      else { const bytes = Buffer.from(input.objects[0]!.bytes, 'base64'); bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1; input.objects[0]!.bytes = bytes.toString('base64'); }
      await writeFile(file, JSON.stringify(input)); const failed = await runLocalAdminCli(['restore', '--config', configPath, '--local-execute']); expect(failed.exitCode).toBe(1); expect(failed.stderr).not.toContain(password);
      const target = await binding();
      try { expect(await target.env.DB.prepare('SELECT count(*) AS n FROM accounts').first('n')).toBe(0); expect((await target.env.PHOTOS.list()).objects).toHaveLength(0); }
      finally { await target.dispose(); }
    }
    expect(oldFloor.length).toBeGreaterThan(0);
  });
});
async function unlinkSafe(path: string): Promise<void> { await (await import('node:fs/promises')).unlink(path); }
