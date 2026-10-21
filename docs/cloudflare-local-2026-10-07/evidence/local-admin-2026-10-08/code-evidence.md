# Local admin code evidence

English · [简体中文](code-evidence.zh-CN.md)

Working tree: `main` / `89b5e157844d62933a5ebfa773e7aa7b8d076cb9`.

## `server/companion-worker/README.md`

SHA-256: `a6e70b514168576904e95a6e85beaa700b148fb2fab52e921830cd23bec54422`

- Line 68: `An operator explicitly stages migration with `migrateLegacy(db, legacyState, {operationId})`.`

## `server/companion-worker/README.zh-CN.md`

SHA-256: `ede7a9215d0ddba46aef2954971997a403167fbdb92f476efe5a0785c9644124`

- Line 63: `默认聚合密文导入在写入前拒绝；操作方显式调用 `migrateLegacy(db, legacyState, {operationId})`，仅暂存身份/授权、提升全部组 epoch，并建立每账号迁移任务。`

## `server/companion-worker/local-admin.md`

SHA-256: `01738cb9e6d051e2bfe049b99db682f7df6066ef09cff7c036236ff23501be90`

- Line 19: `node scripts/local-admin.mjs init --config /tmp/local-admin-parameters.json --local-execute`
- Line 24: ``init --local-execute` creates a fresh mode0700 synthetic workspace and two empty local D1/R2 stores, prints their public service identities and disposes both runtimes.`
- Line 30: `| Command | Default preview | Explicit `--local-execute` |`

## `server/companion-worker/local-admin.zh-CN.md`

SHA-256: `5f70b246338b20b03a57cbbb64f3580fbad866b408bacfe087096c3c4c4d48c6`

- Line 19: `node scripts/local-admin.mjs init --config /tmp/local-admin-parameters.json --local-execute`
- Line 24: ``init --local-execute` 创建权限0700的全新合成目录和两个空的本地 D1/R2 集合，输出公开服务身份后关闭两个运行时。`
- Line 30: `| 子命令 | 默认预览 | 显式 `--local-execute` |`

## `server/companion-worker/package.json`

SHA-256: `c58881adfd22dd4f1a08d23469d558fe0ff486e8bf00113e3e1d35a8aebf0722`


## `server/companion-worker/rslib.admin.config.ts`

SHA-256: `7f16d1deed775ab649cae88b7b6da6fb0788beaf388dafc8aba5f62b8da76381`


## `server/companion-worker/scripts/local-admin.mjs`

SHA-256: `7c25dac4bb8956b4633b26d21ea9c24ec479c0cd5b36b567636c8a92f0512bdf`


## `server/companion-worker/src/admin.test.ts`

SHA-256: `78c9858926aa1407142134f91130162146cb07cb5ebad7307f41effc0213767f`

- Line 19: `const schema = await readFile('migrations/0001-private-relay.sql', 'utf8'); await db.batch(schema.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));`
- Line 38: `it('restores both accounts, encrypted objects, indexes and paired device proofs, without restoring live sessions', async () => {`
- Line 42: `expect(await restoreBackup(restored, backup, floor, key)).toEqual({ restoredAccounts: 2, fencedObjects: 0 });`
- Line 49: `it('restoring an older snapshot cannot revive deleted account ciphertext after receipt ACK', async () => {`
- Line 56: `expect(await restoreBackup(restored, old, latest, key)).toEqual({ restoredAccounts: 1, fencedObjects: 1 });`
- Line 63: `it('rejects modified ciphertext, omitted object bytes and wrong independent backup keys before any target writes', async () => {`
- Line 66: `await expect(restoreBackup(restored, changed, floor, key)).rejects.toThrow('Backup object authentication failed');`
- Line 67: `await expect(restoreBackup(restored, { ...backup, objects: [] }, floor, key)).rejects.toThrow('Duplicate/missing backup object');`
- Line 68: `await expect(restoreBackup(restored, backup, floor, Buffer.alloc(32, 1))).rejects.toThrow();`
- Line 71: `it('rejects an older deletion floor and refuses an already populated restore target', async () => {`
- Line 73: `await expect(restoreBackup(restored, backup, stale, key)).rejects.toThrow('A current deletion floor is required');`
- Line 74: `const current = await exportDeletionFloor(env, key); await restoreBackup(restored, backup, current, key);`
- Line 75: `await expect(restoreBackup(restored, backup, current, key)).rejects.toThrow('Restore requires an empty target');`
- Line 77: `it('validates and migrates a real synthetic legacy file relay, retains IDs and upgrades its verifier after login', async () => {`
- Line 83: `const state: unknown = JSON.parse(await readFile(file, 'utf8')); expect(await migrateLegacy(env.DB, state)).toEqual({ accounts: 1, republishGroups: [] });`
- Line 89: `it('checkpoints bounded offline import batches and keeps HTTP unavailable until the same authenticated restore completes', async () => {`
- Line 98: `await expect(restoreBackup({ ...restored, DB: fault }, backup, floor, key)).rejects.toThrow('PUBLIC interrupted import');`
- Line 101: `await restoreBackup(restored, backup, floor, key);`
- Line 107: `it('stages opaque legacy aggregates without copying ciphertext and completes only after independent native republication', async () => {`
- Line 122: `await expect(migrateLegacy(env.DB,state)).rejects.toThrow('republication required');`
- Line 124: `await migrateLegacy(env.DB,state,{operationId:'PUBLIC-cutover'});`
- Line 132: `expect(await restoreBackup(restored,await exportBackup(env,key),await exportDeletionFloor(env,key),key)).toEqual({restoredAccounts:1,fencedObjects:0});`

## `server/companion-worker/src/admin.ts`

SHA-256: `48ba9126026e33aee6b80689890d35cf32652c2f501bd41a2c9bded3ee03b069`

- Line 39: `await commit(db, await revision(db), [sql(db, 'INSERT INTO maintenance VALUES (1, ?, 0)', importToken)]);`
- Line 44: `await commit(db, await revision(db), [...statements.slice(batch * 32, (batch + 1) * 32), sql(db, 'UPDATE maintenance SET next_batch = ? WHERE id = 1 AND token = ?', batch + 1, importToken)]);`
- Line 46: `await commit(db, await revision(db), [db.prepare('DELETE FROM sessions'), db.prepare('DELETE FROM auth_budgets'), db.prepare('DELETE FROM hash_lease'), sql(db, 'UPDATE meta SET revision = max(revision, ?) WHERE id = 1', minimumRevision), sql(db, 'DELETE FROM maintenance WHERE id = 1 AND token = ?', importToken)]);`
- Line 54: `export async function exportBackup(env: Environment, key: Uint8Array): Promise<Backup> {`
- Line 78: `export async function exportDeletionFloor(env: Environment, key: Uint8Array): Promise<Ciphertext> {`
- Line 89: `export async function restoreBackup(env: Environment, backup: Backup, encryptedFloor: Ciphertext, key: Uint8Array): Promise<{ restoredAccounts: number; fencedObjects: number }> {`
- Line 162: `export function planLegacyMigration(value: unknown, targetEndpoint: string, targetServiceId: string, operationId: string): LegacyMigrationPlan {`
- Line 181: `export async function migrateLegacy(db: D1Database, value: unknown, nativeRepublish?: { operationId: string }): Promise<{ accounts: number; republishGroups: string[] }> {`

## `server/companion-worker/src/local-admin.test.ts`

SHA-256: `28b552fd107c567e402908c8904b68f78c1e1a95fbd9082e14fb4219e33b42af`

- Line 29: `const result = await runLocalAdminCli([command, '--config', configPath, ...(execute ? ['--local-execute'] : [])], factory);`
- Line 40: `async function visit(directory: string): Promise<void> {`
- Line 43: `if (entry.isDirectory()) await visit(p);`
- Line 47: `await visit(path); return result;`
- Line 79: `it('the independent checked-in template previews initialization without bindings or writes', async () => {`
- Line 86: `it('the actual built command wrapper defaults to dry-run and emits only its bounded JSON summary', async () => {`
- Line 91: `it.each([`
- Line 98: `it.each(['https://remote.invalid', 'http://remote.invalid', 'http://10.0.2.2:64043', 'http://user:PUBLIC-secret@127.0.0.1:64043', 'http://127.0.0.1:64043/path', 'http://127.0.0.1:64043?token=PUBLIC-secret'])('refuses nonlocal or credential-bearing origin %s', async origin => {`
- Line 102: `it.each(['../records.json', '/tmp/records.json', 'files//record.json', 'files/./record.json', 'state/source/health.json', 'floors/../snapshot.json', 'backups/latest.json'])('rejects traversing/overlapping floor path %s', async path => {`
- Line 105: `it.each(['--execute', '--remote', '--deploy', '--account-id', '--local-execute --remote'])('rejects unsafe execution argument %s', async flag => {`
- Line 108: `it('rejects wrong nested templates, service IDs, operations and overlapping state', () => {`
- Line 114: `it('default dry-run has no D1/R2/filesystem writes and states that restore authentication was not done', async () => {`
- Line 121: `it('uses actual D1/R2 backup, separately authenticated floor and empty-target restore, without live sessions', async () => {`
- Line 131: `expect((await runLocalAdminCli(['restore', '--config', configPath, '--local-execute'])).exitCode).toBe(1);`
- Line 133: `it('protects ACKed deletion when restoring an older snapshot with the latest separately retained floor', async () => {`
- Line 148: `it('fails closed on an interrupted actual D1 import, clears its invocation lock and retries only authenticated identical input', async () => {`
- Line 158: `const failed = await runLocalAdminCli(['restore', '--config', configPath, '--local-execute'], interrupted);`
- Line 169: `it('refuses symlink inputs/outputs, wrong keys, duplicate objects, and leaves no output on export failure', async () => {`
- Line 172: `expect((await runLocalAdminCli(['backup', '--config', configPath, '--local-execute'])).exitCode).toBe(1);`
- Line 175: `const error = await runLocalAdminCli(['backup', '--config', configPath, '--local-execute'], failed); expect(error.exitCode).toBe(1); expect(error.stderr).not.toContain('ciphertext');`
- Line 179: `expect((await runLocalAdminCli(['restore', '--config', configPath, '--local-execute'])).exitCode).toBe(1); await writeFile(join(config.workspace, config.paths.operatorKey), original);`
- Line 184: `it('refuses a mismatched target identity, output replacement, existing workspace and retained process lock', async () => {`
- Line 186: `expect((await runLocalAdminCli(['migration-stage', '--config', configPath, '--local-execute'])).stderr).toContain('target_identity_mismatch');`
- Line 188: `expect((await runLocalAdminCli(['init', '--config', configPath, '--local-execute'])).exitCode).toBe(1);`
- Line 190: `expect((await runLocalAdminCli(['backup', '--config', configPath, '--local-execute'])).stderr).toContain('workspace_busy');`
- Line 193: `expect((await runLocalAdminCli(['backup', '--config', configPath, '--local-execute'])).stderr).toContain('output_exists');`
- Line 196: `it('refuses malformed/symlink/oversized inputs and permissive key files before opening bindings', async () => {`
- Line 209: `it('refuses an export beyond its restorable object bound before publishing a snapshot', async () => {`
- Line 213: `const result = await runLocalAdminCli(['backup', '--config', configPath, '--local-execute']);`
- Line 217: `it('rejects tampered and missing ciphertext and an authenticated stale floor before importing any target data', async () => {`
- Line 224: `expect((await runLocalAdminCli(['restore', '--config', configPath, '--local-execute'])).exitCode).toBe(1);`
- Line 231: `await writeFile(file, JSON.stringify(input)); const failed = await runLocalAdminCli(['restore', '--config', configPath, '--local-execute']); expect(failed.exitCode).toBe(1); expect(failed.stderr).not.toContain(password);`

## `server/companion-worker/src/local-admin.ts`

SHA-256: `236f4149a973cd1b46095452cc47eebf1b71d75d9421c068984a3761fee61367`

- Line 38: `function relativePath(value: unknown): string {`
- Line 39: `if (typeof value !== 'string' || value.length > 240 || !/^[a-zA-Z0-9._/-]+$/.test(value) || isAbsolute(value) || value.split('/').some(p => !p || p === '.' || p === '..')) return refuse('unsafe_path');`
- Line 43: `export function validateLocalAdminConfig(value: unknown): LocalAdminConfig {`
- Line 47: `const paths = { sourceState: relativePath(p.sourceState), targetState: relativePath(p.targetState), operatorKey: relativePath(p.operatorKey), backup: relativePath(p.backup), deletionFloor: relativePath(p.deletionFloor), legacySource: relativePath(p.legacySource) };`
- Line 49: `const independentDirectories = [dirname(paths.operatorKey), dirname(paths.backup), dirname(paths.deletionFloor)];`
- Line 50: `if (all.some((path, index) => all.slice(index + 1).some(other => overlaps(path, other))) || independentDirectories.includes('.') || independentDirectories.some((path, index) => independentDirectories.slice(index + 1).some(other => overlaps(path, other))) || all.some(path => path.split('/').some(part => part.startsWith('.local-admin')))) return refuse('unsafe_path');`
- Line 57: `export function parseLocalAdminArguments(args: readonly string[]): LocalAdminInvocation {`
- Line 58: `if (![3, 4].includes(args.length) || !LOCAL_ADMIN_COMMANDS.includes(args[0] ?? '') || args[1] !== '--config' || !args[2] || (args.length === 4 && !['--dry-run', '--local-execute'].includes(args[3]!))) return refuse('invalid_arguments');`
- Line 59: `if (args[0] === 'migration-plan' && args[3] === '--local-execute') return refuse('invalid_arguments');`
- Line 60: `return { command: args[0] as LocalAdminCommand, configPath: args[2], execute: args[3] === '--local-execute' };`
- Line 68: `for (const part of relative.split('/')) {`
- Line 101: `async function writeNew(path: string, bytes: string): Promise<void> {`
- Line 125: `export function decodeLocalBackup(value: unknown): Backup {`
- Line 138: `export async function openLocalAdminBinding(stateDirectory: string, initialize: boolean): Promise<LocalAdminBinding> {`
- Line 142: `const mf = new Miniflare({ ...convertV4MiniflareOptions({ host: '127.0.0.1', port: 0, scriptPath: join(packageDirectory, 'dist/worker.js'), modules: true, compatibilityDate: '2026-10-07', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['PHOTOS'], telemetry: { enabled: false }, outboundService: () => new Response('Local admin refuses outbound access', { status: 403 }) }), resourcePersistencePath: stateDirectory, log: new Log(LogLevel.NONE) });`
- Line 148: `await DB.batch(schema.split(';').map(s => s.trim()).filter(Boolean).map(s => DB.prepare(s)));`
- Line 154: `export async function runLocalAdmin(invocation: LocalAdminInvocation, factory: LocalAdminFactory = openLocalAdminBinding): Promise<LocalAdminSummary> {`
- Line 188: `await writeNew(join(root, '.local-admin-workspace.json'), JSON.stringify({ version: 1, syntheticOnly: true }));`
- Line 195: `await writeNew(join(path, '.local-admin-state.json'), JSON.stringify({ version: 1, syntheticOnly: true }));`
- Line 216: `await writeNew(paths.backup, JSON.stringify({ version: 1, manifest: result.manifest, objects: result.objects.map(o => ({ key: o.key, bytes: Buffer.from(o.bytes).toString('base64') })) }));`
- Line 218: `await writeNew(paths.deletionFloor, JSON.stringify(await exportDeletionFloor(binding.env, key!)));`
- Line 220: `const result = await restoreBackup(binding.env, backup!, floor!, key!);`
- Line 225: `const result = await migrateLegacy(binding.env.DB, legacy, { operationId: config.migration.operationId });`
- Line 234: `export async function runLocalAdminCli(args: readonly string[], factory: LocalAdminFactory = openLocalAdminBinding): Promise<LocalAdminCliResult> {`

## `server/companion-worker/templates/local-admin.example.json`

SHA-256: `291a393f549376c359d237a22dc6e0b70f9441f3b1cbd689cbf0cd8de0b5a1e4`


