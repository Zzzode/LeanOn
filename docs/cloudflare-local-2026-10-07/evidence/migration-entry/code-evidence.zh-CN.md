# 迁移入口代码证据

简体中文 · [English](code-evidence.md)

main 分支 89b5e157 的当前工作区；行号对应证据包内源码，不代表干净 HEAD。

## `packages/pages/src/components/SettingsScreen.tsx`

SHA-256: `eef206eb99a1c1655518960a34fa58dd0b7e653d1ef8b9c4412ebf65009b4675`

- Line 93: `<view id="migration-open" flatten={false} className="Settings-row Settings-tappable" accessibility-element={true} accessibility-traits="button" accessibility-label={t('migration.title')} bindtap={migrationAvailable?onOpenMigration:undefined}>`

## `packages/pages/src/App.tsx`

SHA-256: `7a0428289302f79efafd0f8dcd6a93cac26db69a5893b717f19bdac1219588ae`

- Line 762: `<SettingsScreen t={t} locale={locale} appearance={appearance} onAppearanceChange={handleAppearanceChange} onLocaleChange={handleLocaleChange} onOpenReminders={handleOpenReminders} onOpenHealthConnect={handleOpenHealthConnect} remindersAvailable={toolsAvailable.reminders} healthAvailable={provider !== null} migrationAvailable={isNativeShell && supports('companion.getMigrationState')} onOpenMigration={()=>setActiveSheet('migration')} />`
- Line 834: `{activeSheet==='migration'&&<MigrationSheet bridge={bridge} t={t} onClose={()=>setActiveSheet('none')}/>}`

## `packages/pages/src/components/MigrationSheet.tsx`

SHA-256: `978c87c2899f8ccacb29e2f213b1a095aef5825fd85f4924c769d7ab7ed9fba7`

- Line 9: `export function MigrationSheet({ bridge, t, onClose }: { bridge: LeanOnBridgeClient; t: Translator; onClose: () => void }) {`
- Line 15: `const refresh = async () => { if(polling.current)return;polling.current=true;try{apply(await bridge.invoke('companion.getMigrationState'));}catch{setError(t('migration.loadError'));}finally{polling.current=false;} };`
- Line 18: `void bridge.invoke('companion.getMigrationState').then(response=>{if(alive){const next=apply(response);setEndpoint(next.targetEndpoint??'');}}).catch(()=>{if(alive)setError(t('migration.loadError'));});`
- Line 28: `try{apply(await bridge.invoke('companion.getMigrationState'));}catch{/* Preserve the last confirmed native projection. */}`
- Line 31: `const pause = async () => {setError(null);try{apply(await bridge.invoke('companion.pauseMigration'));setConsent(false);}catch{setError(t('migration.error'));}};`
- Line 38: `if(review && view.previewToken!==null)void run(()=>bridge.invoke('companion.startMigration',{previewToken:view.previewToken!,password:secret,backupPassword:backup,consent:true}));`
- Line 39: `else void run(()=>bridge.invoke('companion.resumeMigration',{password:secret,backupPassword:backup,consent:true}));`
- Line 40: `}else if(phase==='active' && consent)void run(()=>bridge.invoke('companion.rollbackMigration',{consent:true}));`

## `packages/pages/src/state/migration-ui.ts`

SHA-256: `73ddfe6df477a35bbcf0ba1d8a616efc4a74edac83d52ae4decd85effb1d9fde`

- Line 7: `export function readMigrationState(response: unknown): CompanionMigrationState | null {`
- Line 19: `export function migrationRunning(phase: CompanionMigrationState['phase']): boolean { return ['preparing','restoring','publishing','pausing','activating'].includes(phase); }`
- Line 20: `export function migrationConfirmed(state: CompanionMigrationState, consent: boolean, password: string, backupPassword: string): boolean {`

## `packages/bridge/src/contracts.ts`

SHA-256: `2490bfba90063e825a2690f56ddbf8506ed2eb0a619f3628a72f697833b85008`

- Line 175: `'companion.getMigrationState': { request: void; response: CompanionMigrationResponse };`
- Line 176: `'companion.previewMigration': { request: { targetEndpoint: string; password: string }; response: CompanionMigrationResponse };`
- Line 177: `'companion.startMigration': { request: { previewToken: string; password: string; backupPassword: string; consent: true }; response: CompanionMigrationResponse };`
- Line 178: `'companion.resumeMigration': { request: { password: string; backupPassword: string; consent: true }; response: CompanionMigrationResponse };`
- Line 179: `'companion.pauseMigration': { request: void; response: CompanionMigrationResponse };`
- Line 180: `'companion.rollbackMigration': { request: { consent: true }; response: CompanionMigrationResponse };`
- Line 462: `'companion.migrationChanged': { payload: CompanionMigrationResponse };`
- Line 501: `companionGetMigrationState: 'companion.getMigrationState',`
- Line 502: `companionPreviewMigration: 'companion.previewMigration',`
- Line 503: `companionStartMigration: 'companion.startMigration',`
- Line 504: `companionResumeMigration: 'companion.resumeMigration',`
- Line 505: `companionPauseMigration: 'companion.pauseMigration',`
- Line 506: `companionRollbackMigration: 'companion.rollbackMigration',`

## `apps/ios/LeanOn/Companion/companion-migration-controller.swift`

SHA-256: `645fda23d240d9d4c9bba6dc861d5ec4ed48c23d2a3a867889582ec6fce80d61`

- Line 11: `private func withControl<T>(_ operation: () throws -> T) rethrows -> T {`
- Line 73: `func start(token: String, password: String, backupPassword: String, consent: Bool) throws -> NSDictionary {`
- Line 85: `try withControl { running = true; pauseRequested = false; value["phase"] = "preparing"; try save(value) }`
- Line 89: `let paused = try withControl { value["phase"] = pauseRequested ? "paused" : "prepared"; value["previewToken"] = NSNull(); try save(value); return pauseRequested }`
- Line 97: `func publish(password: String, backupPassword: String, consent: Bool) throws -> NSDictionary {`
- Line 107: `try withControl { if !running { pauseRequested = false }; running = true; value["phase"] = "publishing"; value["errorCode"] = NSNull(); try save(value) }`
- Line 142: `func rollback(consent: Bool) throws -> NSDictionary {`

## `apps/android/app/src/main/java/com/zzzode/leanon/companion/CompanionMigrationController.kt`

SHA-256: `a9b4ac37556637ea1968c99cfd5f767e5789cf964898e1855a3ff9ac714ea956`

- Line 51: `@Synchronized fun preview(endpoint: String, password: String): JSONObject {`
- Line 70: `@Synchronized fun start(token: String, password: String, backupPassword: String, consent: Boolean): JSONObject {`
- Line 85: `@Synchronized fun resume(password: String, backupPassword: String, consent: Boolean): JSONObject {`
- Line 118: `@Synchronized fun rollback(consent: Boolean): JSONObject {`

## `apps/ios/LeanOnTests/companion-migration-entry-tests.swift`

SHA-256: `03882e8504ccdd94cd25d68cae7bdab500cfda1797514de32ca455e45dbb7f69`

- Line 16: `func testSeedActualMigrationSettingsFixture() throws {`
- Line 45: `func testActualMigrationCheckpointPreservesHealthAndRepeatedAction() throws {`
- Line 74: `func testAddExplicitSyntheticHealthRecordsBeforeUIReview() throws {`
- Line 90: `func testActualPreviewUsesAuthenticatedTargetAndCancelsWithoutSwitching() throws {`
- Line 105: `func testMigrationControlWriteFailureReleasesLockForNextStatusRead() throws {`

## `apps/ios/LeanOnUITests/migration-entry-ui-tests.swift`

SHA-256: `c86f0b88a95bbd9472e6a08198212b7c46966fd0b17758d1955ffa6352686026`

- Line 58: `func testSettingsPreviewConsentPauseRestartResumeAndActive() {`
- Line 65: `XCTAssertEqual(item("Confirm migration").value as? String, "Unavailable")`
- Line 76: `XCTAssertEqual(item("Resume migration").value as? String, "Unavailable")`
- Line 85: `func testSettingsConfirmedRollbackAndRestart() {`
- Line 87: `XCTAssertEqual(item("Return to source").value as? String, "Unavailable")`

## `apps/android/app/src/androidTest/java/com/zzzode/leanon/companion/MigrationEntryFixture.kt`

SHA-256: `f86f620d2a49a22e626a7bb48bbdea7ea9252f4fb43c6bd484a540490cdf583a`

- Line 56: `fun verify(context: Context): JSONObject {`

## `apps/android/app/src/androidTest/java/com/zzzode/leanon/qa/MigrationEntryUiSession.kt`

SHA-256: `7491babd7075da69225aadafe220e44f27dd8c59513340b2f89b7355ecf9357d`

- Line 39: `if(android.os.Build.VERSION.SDK_INT>=33)automation.clearCache()`
- Line 48: `File(directory,"$name-native-state.json").writeText(app.migration.state().toString(2))`

## `packages/pages/src/state/migration-ui.test.ts`

SHA-256: `c117398a2dcc254e468fd84c048ef81b7705d97317a6794b256daf6f2d65f1c7`

- Line 11: `it('accepts explicit native checkpoints without inventing missing state', () => {`
- Line 18: `it('requires consent and both passwords again after a persisted pause', () => {`
- Line 26: `it('polls only actual in-flight states', () => {`

## `server/companion-worker/src/admin.ts`

SHA-256: `48ba9126026e33aee6b80689890d35cf32652c2f501bd41a2c9bded3ee03b069`

- Line 157: `export interface LegacyMigrationPlan {`
- Line 162: `export function planLegacyMigration(value: unknown, targetEndpoint: string, targetServiceId: string, operationId: string): LegacyMigrationPlan {`

## `server/companion-worker/scripts/migration-plan.mjs`

SHA-256: `c2d0442952a630e1dfea3d2561d7ef38bb80a3a1e230de12f49a6dbf6d4fbd43`

- Line 2: `import { planLegacyMigration } from '../dist/admin.js';`
- Line 7: `if(argumentsList.length!==9 || argumentsList[0]!=='--dry-run')throw new Error('Use --dry-run --source FILE --target ORIGIN --service-id VERIFIED_ID --operation ID');`
- Line 15: `process.stdout.write(JSON.stringify(planLegacyMigration(state,options['--target'],options['--service-id'],options['--operation']),null,2)+'\n');`
