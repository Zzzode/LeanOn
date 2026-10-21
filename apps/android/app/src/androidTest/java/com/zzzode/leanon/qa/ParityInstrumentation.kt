package com.zzzode.leanon.qa

import android.app.Activity
import android.app.Instrumentation
import android.app.Application
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.view.accessibility.AccessibilityNodeInfo
import com.zzzode.leanon.MainActivity
import com.zzzode.leanon.data.RecordsRepository
import com.zzzode.leanon.data.SettingsRepository
import com.zzzode.leanon.healthconnect.HealthConnectExportLedger
import com.zzzode.leanon.healthconnect.HealthConnectMappers
import com.zzzode.leanon.healthconnect.ExportVersionRequest
import com.zzzode.leanon.reminders.ReminderSettings
import com.zzzode.leanon.reminders.ReminderSlot
import java.io.IOException
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/** Official device instrumentation; every native write targets a disposable cache fixture. */
class ParityInstrumentation : Instrumentation() {
  private val checks = JSONArray()
  private val ui = JSONArray()
  private lateinit var directory: File

  private var daily = false
  private var migrationEntry = false
  private var resetDaily = false
  private var personalNative = false
  private var publicBackupInterop = false
  private var companionInterop: String? = null
  private var cloudflareEndpoint: String? = null
  private var cloudflareInterop: String? = null
  private var receiptProcess: Pair<String, String>? = null
  private var scannerNative = false
  private var scannerUi = false
  private var approvedPersonalCleanup = false
  private var approvedAccessibilityCleanup = false
  private var preserveReaderServices = false
  private var privateUiNamespace: String? = null
  private val applicationReady = java.util.concurrent.CountDownLatch(1)
  override fun callApplicationOnCreate(app: Application) {
    super.callApplicationOnCreate(app)
    applicationReady.countDown()
  }
  override fun onCreate(arguments: Bundle?) {
    super.onCreate(arguments)
    daily = arguments?.getString("scenario") == "daily-interactive"
    migrationEntry = arguments?.getString("scenario") == "migration-entry-ui"
    resetDaily = arguments?.getString("reset") == "true"
    personalNative = arguments?.getString("scenario") == "personal-native"
    publicBackupInterop = arguments?.getString("scenario") == "public-backup-interop"
    if (arguments?.getString("scenario") == "companion-interop") companionInterop = arguments.getString("stage") ?: "invalid"
    if (arguments?.getString("scenario") == "cloudflare-interop") cloudflareInterop = arguments.getString("stage") ?: "invalid"
    if (arguments?.getString("scenario") == "cloudflare-native") cloudflareEndpoint = arguments.getString("endpoint") ?: "invalid"
    if (arguments?.getString("scenario") == "receipt-cross-process") receiptProcess = Pair(arguments.getString("stage") ?: "invalid", arguments.getString("endpoint") ?: "invalid")
    scannerNative = arguments?.getString("scenario") == "scanner-native"
    scannerUi = arguments?.getString("scenario") == "scanner-interactive"
    approvedPersonalCleanup = arguments?.getString("scenario") == "approved-personal-ui-cleanup"
    approvedAccessibilityCleanup = arguments?.getString("scenario") == "approved-a11y-ui-cleanup"
    preserveReaderServices = arguments?.getString("scenario") == "accessibility-reader"
    privateUiNamespace = when (arguments?.getString("scenario")) { "personal-interactive" -> "personal-ui"; "companion-interactive" -> "companion-ui"; "accessibility-interactive", "accessibility-reader" -> "a11y-ui"; else -> null }
    start()
  }

  override fun onStart() {
    check(applicationReady.await(30, java.util.concurrent.TimeUnit.SECONDS)) { "QA application initialization timed out" }
    if (migrationEntry) { MigrationEntryUiSession(this, resetDaily).run(); return }
    if (approvedPersonalCleanup || approvedAccessibilityCleanup) { cleanupApprovedPersonalFixture(); return }
    privateUiNamespace?.let { DailyUiSession(this, resetDaily, it, preserveReaderServices).run(); return }
    if (daily) { DailyUiSession(this, resetDaily).run(); return }
    if (personalNative) { PersonalNativeChecks(this).run(); return }
    if (publicBackupInterop) { PublicBackupInteropChecks(this).run(); return }
    companionInterop?.let { com.zzzode.leanon.companion.CompanionInteropNativeChecks(this).run(it); return }
    cloudflareInterop?.let { com.zzzode.leanon.companion.CloudflareInteropChecks(this).run(it); return }
    cloudflareEndpoint?.let { com.zzzode.leanon.companion.CloudflareNativeChecks(this).run(it); return }
    receiptProcess?.let { com.zzzode.leanon.companion.ReceiptProcessNativeChecks(this).run(it.first, it.second); return }
    if (scannerNative) { ScannerNativeChecks(this).run(); return }
    if (scannerUi) { DailyUiSession(this, resetDaily, "scanner-ui").run(); return }
    val report = JSONObject().put("kind", "android-platform-instrumentation-native-persistence-and-accessibility")
      .put("capturedUtc", Instant.now().toString()).put("uiButtonSaveCoverage", false)
    try {
      check(targetContext.packageName == "com.zzzode.leanon.uiqa") { "Only the disposable .uiqa app is permitted" }
      directory = File(targetContext.cacheDir, "parity-instrumentation").apply { mkdirs() }
      val original = File(targetContext.filesDir, "records.json")
      val before = sha(original)
      val fixture = File(directory, "native-fixture").apply { mkdirs() }
      File(fixture, "records.json").delete()
      val isolatedContext = object : ContextWrapper(targetContext) {
        override fun getApplicationContext(): Context = this
        override fun getFilesDir(): File = fixture
      }
      var now = Clock.fixed(Instant.parse("2026-10-06T23:59:00Z"), ZoneOffset.UTC)
      fun store() = RecordsRepository(isolatedContext) { now }
      val records = store()
      records.upsertWater("2026-10-06", 750.0)
      records.upsertWater("2026-10-06", 250.0)
      verify("water-upsert-restart", store().loadHostData().getJSONArray("water").let { array ->
        (0 until array.length()).map { array.getJSONObject(it) }.single { it.getString("date") == "2026-10-06" }.getDouble("amountMl") == 250.0
      })
      records.addCustomFood("custom-parity", "QA oats", 370.0, 12.0, 60.0, 7.0, 40.0, 8.0)
      records.setFoodFavorite("custom-parity", true)
      records.setFoodFavorite("custom-parity", true)
      records.addIntake("2026-10-06", 148.0, 4.8, 24.0, 2.8, foodId = "custom-parity")
      records.updateCustomFood("custom-parity", "QA edited", 380.0, 13.0, 61.0, 8.0, null)
      val food = store().loadHostData().getJSONArray("customFoods").let { array ->
        (0 until array.length()).map { array.getJSONObject(it) }.single { it.getString("id") == "custom-parity" }
      }
      verify("custom-update-restart-default-clear", food.getJSONObject("name").getString("en") == "QA edited" && !food.has("defaultGrams"))
      verify("favorite-idempotent", store().loadHostData().getJSONArray("favoriteFoodIds").let { array ->
        (0 until array.length()).count { array.getString(it) == "custom-parity" } == 1
      })
      for (index in 1..15) records.addIntake("2026-10-06", 10.0, 0.0, 0.0, 0.0, foodId = "qa-$index")
      records.addIntake("2026-10-06", 10.0, 0.0, 0.0, 0.0, foodId = "qa-10")
      val recent = store().loadHostData().getJSONArray("recentFoodIds")
      verify("recent-most-first-dedup-limit12", recent.length() == 12 && recent.getString(0) == "qa-10"
        && (0 until recent.length()).map { recent.getString(it) }.toSet().size == 12)
      records.addIntake("2026-10-06", 10.0, 0.0, 0.0, 0.0, foodId = "custom-parity")
      val afterDelete = records.deleteCustomFood("custom-parity")
      verify("delete-cleans-favorite-recent", listOf("favoriteFoodIds", "recentFoodIds").all { key ->
        val array = afterDelete.getJSONArray(key); (0 until array.length()).none { array.getString(it) == "custom-parity" }
      })
      val saved = File(fixture, "records.json").readText()
      now = Clock.fixed(Instant.parse("2026-10-07T00:01:00Z"), ZoneOffset.UTC)
      verify("local-clock-rollover-no-record-rewrite", records.currentSnapshot().getString("today") == "2026-10-07"
        && records.currentSnapshot().getInt("todayHour") == 0 && records.currentSnapshot().getInt("streak") >= 1
        && File(fixture, "records.json").readText() == saved)
      report.put("fixtureSnapshot", records.currentSnapshot()).put("fixtureRecordsSha256", sha(File(fixture, "records.json")))
      checkDurableSettingsAndVersions(fixture)
      captureUi()
      val after = sha(original)
      verify("application-health-record-file-unchanged", before == after)
      report.put("applicationRecordsSha256Before", before).put("applicationRecordsSha256After", after)
      report.put("success", true)
    } catch (error: Throwable) {
      report.put("success", false).put("failure", error.toString())
    }
    report.put("nativeChecks", checks).put("accessibilityActions", ui)
      .put("uiCoverageBoundary", "Native fixture checks are persistence/SDK checks; only logged successful accessibility actions are UI interactions. No water/add or save button is invoked.")
    val output = File(targetContext.cacheDir, "parity-qa-report.json")
    output.writeText(report.toString(2))
    finish(if (report.optBoolean("success")) Activity.RESULT_OK else Activity.RESULT_CANCELED,
      Bundle().apply { putString("report", output.absolutePath); putString("success", report.optBoolean("success").toString()) })
  }

  /** Approved disposable fixture scopes only; never constructs a repository or reads key material. */
  private fun cleanupApprovedPersonalFixture() {
    check(com.zzzode.leanon.BuildConfig.DEBUG && targetContext.packageName == "com.zzzode.leanon.uiqa")
    val namespace = if (approvedAccessibilityCleanup) "a11y-ui" else "personal-ui"
    check(namespace in setOf("a11y-ui", "personal-ui"))
    val original = File(targetContext.filesDir, "records.json")
    val before = sha(original)
    val fixture = File(targetContext.cacheDir, namespace)
    check(fixture.canonicalFile.parentFile == targetContext.cacheDir.canonicalFile)
    if (fixture.exists()) java.nio.file.Files.walk(fixture.toPath()).use { paths ->
      check(paths.noneMatch { java.nio.file.Files.isSymbolicLink(it) }) { "QA cleanup refuses symbolic links" }
    }
    val aliases = listOf("records", "personal", "private-transactions", "companion")
      .map { "$namespace.com.zzzode.leanon.uiqa.leanon.$it.wrap.v1" }
    val store = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val previous = JSONObject(); val remaining = JSONObject()
    aliases.forEach { previous.put(it, store.containsAlias(it)); store.deleteEntry(it) }
    aliases.forEach { remaining.put(it, store.containsAlias(it)) }
    check(fixture.deleteRecursively() || !fixture.exists()) { "QA fixture cleanup unavailable" }
    check(aliases.none { store.containsAlias(it) } && !fixture.exists() && before == sha(original))
    val report = JSONObject().put("scope", "Explicitly approved fictional $namespace cache and exactly four namespaced aliases only")
      .put("utc", Instant.now().toString()).put("aliasesBefore", previous).put("aliasesAfter", remaining)
      .put("cacheAbsent", !fixture.exists()).put("originalRecordsBeforeSha256", before).put("originalRecordsAfterSha256", sha(original))
      .put("repositoryInstantiated", false).put("keyMaterialRead", false)
    val output = File(targetContext.cacheDir, "qa-cleanup-reports").apply { mkdirs() }
    File(output, "$namespace-key-cleanup.json").writeText(report.toString(2))
    finish(Activity.RESULT_OK, Bundle().apply { putString("report", "cache/qa-cleanup-reports/$namespace-key-cleanup.json") })
  }

  private fun checkDurableSettingsAndVersions(fixture: File) {
    val settingsFile = File(fixture, "settings.json").apply { delete() }
    val legacy = JSONObject().put("weight_enabled", false).put("weight_hour", 8)
      .put("health_connect_enabled", true).put("health_connect_last_sync", 123L)
    val settings = SettingsRepository(settingsFile, { JSONObject(legacy.toString()) })
    val desired = ReminderSettings(ReminderSlot(false, 9, 15), ReminderSlot(false, 22, 0))
    settings.setReminderSettings(desired)
    val reopened = SettingsRepository(settingsFile)
    verify("settings-migration-reopen", reopened.getReminderSettings() == desired &&
      reopened.getHealthConnectEnabled() && reopened.getLastSyncEpochMs() == 123L)
    val saved = settingsFile.readText()
    var failed = false
    try { SettingsRepository(settingsFile, persist = { _, _ -> throw IOException("QA disk failure") }).setHealthConnectEnabled(false) }
    catch (_: IOException) { failed = true }
    verify("settings-failed-write-preserves-old", failed && settingsFile.readText() == saved && reopened.getHealthConnectEnabled())
    val corruptSettings = File(fixture, "corrupt-settings.json").apply { writeText("{broken") }
    failed = false
    try { SettingsRepository(corruptSettings).setLastSyncEpochMs(999L) } catch (_: IOException) { failed = true }
    verify("settings-corrupt-file-preserved", failed && corruptSettings.readText() == "{broken")

    val ledgerFile = File(fixture, "export-ledger.json").apply { delete() }
    val id = "leanon-weight-2026-10-06"
    val ledger = HealthConnectExportLedger(ledgerFile)
    val initial = ledger.reserve(listOf(ExportVersionRequest(id, "content-a")))
    val retry = HealthConnectExportLedger(ledgerFile).reserve(listOf(ExportVersionRequest(id, "content-a")))
    verify("ledger-unchanged-retry-after-reopen", initial[id] == 2L && retry[id] == 2L)
    val changed = ledger.reserve(listOf(ExportVersionRequest(id, "content-b")))
    verify("ledger-content-edit-increments-after-reopen", changed[id] == 3L &&
      HealthConnectExportLedger(ledgerFile).reserve(listOf(ExportVersionRequest(id, "content-b")))[id] == 3L)
    val ledgerSaved = ledgerFile.readText()
    failed = false
    var inserted = false
    try {
      HealthConnectExportLedger(ledgerFile, persist = { _, _ -> throw IOException("QA disk failure") })
        .reserve(listOf(ExportVersionRequest(id, "content-c")))
      inserted = true
    } catch (_: IOException) { failed = true }
    verify("ledger-failed-reservation-blocks-insert", failed && !inserted && ledgerFile.readText() == ledgerSaved)
    val exportHost = JSONObject().put("weights", JSONArray().put(JSONObject().put("date", "2026-10-06").put("weightKg", 80.0)))
    val realLedger = HealthConnectExportLedger(File(fixture, "mapped-ledger.json").apply { delete() })
    val reserved = realLedger.reserve(HealthConnectMappers.versionRequests(exportHost))
    val mapped = HealthConnectMappers.buildAll(exportHost, reserved).single()
    verify("native-sdk-metadata-uses-durable-revision", mapped.metadata.clientRecordVersion == reserved[mapped.metadata.clientRecordId])
    val corruptLedger = File(fixture, "corrupt-ledger.json").apply { writeText("{broken") }
    failed = false
    try { HealthConnectExportLedger(corruptLedger).reserve(listOf(ExportVersionRequest(id, "content-a"))) }
    catch (_: IOException) { failed = true }
    verify("ledger-corrupt-file-preserved", failed && corruptLedger.readText() == "{broken")
  }

  private fun verify(name: String, passed: Boolean) {
    checks.put(JSONObject().put("name", name).put("passed", passed)); check(passed) { name }
  }

  private fun sha(file: File): String = if (!file.exists()) "missing" else
    MessageDigest.getInstance("SHA-256").digest(file.readBytes()).joinToString("") { "%02x".format(it) }

  private fun launch(mode: String) {
    targetContext.startActivity(Intent(targetContext, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      .putExtra("leanon_qa_route", "today").putExtra("leanon_qa_appearance", mode)
      .putExtra("leanon_qa_now", "2026-10-01T19:00:00+08:00"))
    waitForIdleSync(); Thread.sleep(3000)
  }

  private fun screenshot(name: String) {
    val bitmap = uiAutomation.takeScreenshot() ?: return
    File(directory, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    bitmap.recycle()
    ui.put(JSONObject().put("capture", "$name.png").put("capturedUtc", Instant.now().toString()).put("actualDeviceScreenshot", true))
  }

  private fun find(root: AccessibilityNodeInfo?, label: String): AccessibilityNodeInfo? {
    if (root == null) return null
    if (root.contentDescription?.toString() == label || root.text?.toString() == label) return root
    for (index in 0 until root.childCount) find(root.getChild(index), label)?.let { return it }
    return null
  }

  private fun action(label: String, action: Int, arguments: Bundle? = null): Boolean {
    val node = find(uiAutomation.rootInActiveWindow, label)
    val performed = node?.performAction(action, arguments) ?: false
    ui.put(JSONObject().put("label", label).put("action", action).put("nodeFound", node != null).put("performed", performed))
    Thread.sleep(1200)
    return performed
  }

  private fun captureUi() {
    launch("light"); screenshot("today-light")
    val opened = action("记录饮食", AccessibilityNodeInfo.ACTION_CLICK)
    if (opened) {
      screenshot("food-picker-light")
      val arguments = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "QA temporary draft") }
      if (action("搜索食物", AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
        && action("创建自定义食物", AccessibilityNodeInfo.ACTION_CLICK)) {
        screenshot("custom-food-light")
        launch("dark"); screenshot("custom-food-dark")
      }
      action("取消", AccessibilityNodeInfo.ACTION_CLICK)
    }
    launch("dark"); screenshot("today-dark")
    launch("system")
  }
}
