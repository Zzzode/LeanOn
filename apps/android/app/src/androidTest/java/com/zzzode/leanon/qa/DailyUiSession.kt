package com.zzzode.leanon.qa

import android.app.Activity
import android.app.Application
import android.app.Instrumentation
import android.app.UiAutomation
import android.content.Context
import android.content.ContextWrapper
import com.zzzode.leanon.personal.*
import com.zzzode.leanon.companion.CompanionRepository
import com.zzzode.leanon.companion.CompanionLocalPort
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Bundle
import android.os.SystemClock
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.inputmethod.InputMethodManager
import android.view.accessibility.AccessibilityNodeInfo
import com.zzzode.leanon.LeanOnApplication
import com.zzzode.leanon.MainActivity
import com.zzzode.leanon.data.RecordsRepository
import com.zzzode.leanon.data.emptyDailyRecords
import com.zzzode.leanon.data.toJavaOnlyMap
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.security.MessageDigest
import java.time.Instant

/** Interactive official instrumentation. Only disposable QA cache is writable. */
internal class DailyUiSession(
  private val instrumentation: Instrumentation,
  private val reset: Boolean,
  private val namespace: String = "daily-ui",
  private val preserveReaderServices: Boolean = false,
) {
  private val automation get() = instrumentation.getUiAutomation(if (preserveReaderServices) UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES else 0)
  private val context get() = instrumentation.targetContext
  private val app get() = context.applicationContext as LeanOnApplication
  private lateinit var directory: File
  private val actions = JSONArray()
  @Volatile private var activeMainActivity: MainActivity? = null
  private val activityCallbacks = object : Application.ActivityLifecycleCallbacks {
    override fun onActivityResumed(activity: Activity) { if (activity is MainActivity) activeMainActivity = activity }
    override fun onActivityDestroyed(activity: Activity) { if (activeMainActivity === activity) activeMainActivity = null }
    override fun onActivityCreated(activity: Activity, state: Bundle?) = Unit
    override fun onActivityStarted(activity: Activity) = Unit
    override fun onActivityPaused(activity: Activity) = Unit
    override fun onActivityStopped(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) = Unit
  }

  fun run() {
    check(context.packageName == "com.zzzode.leanon.uiqa")
    check(namespace in setOf("daily-ui", "scanner-ui", "personal-ui", "companion-ui", "a11y-ui"))
    directory = File(context.cacheDir, namespace).apply { mkdirs() }
    val originalRepository = app.records
    val originalBackup = app.backup
    val originalPersonal = app.personal; val originalCompanion = app.companion; val originalPreviews = app.personalPreviews
    val originalPersonalFile = File(context.filesDir, "personal-v1/state.enc"); val originalCompanionFile = File(context.filesDir, "companion-v1/state.enc")
    val beforePersonal = hash(originalPersonalFile); val beforeCompanion = hash(originalCompanionFile)
    val originalFile = File(context.filesDir, "records.json")
    val before = hash(originalFile)
    val fixture = File(directory, "records.json")
    if (reset) fixture.delete()
    val privateFlow = namespace in setOf("personal-ui", "companion-ui", "a11y-ui")
    val isolatedContext = object : ContextWrapper(context) {
      override fun getFilesDir(): File = directory
      override fun getCacheDir(): File = File(directory, "cache").apply { mkdirs() }
      override fun getApplicationContext(): Context = this
      override fun getPackageName(): String = "$namespace.${context.packageName}"
    }
    if (reset && privateFlow) {
      File(directory, "personal-v1").deleteRecursively(); File(directory, "companion-v1").deleteRecursively()
    }
    val repository = if (privateFlow) RecordsRepository(isolatedContext) { app.recordClock() }
      else RecordsRepository(fixture, { emptyDailyRecords().toString() }, clock = { app.recordClock() })
    app.installQaRecords(repository)
    if (privateFlow) {
      app.installQaPersonal(PersonalRepository(isolatedContext)); app.installQaPreviews(PersonalPreviews(isolatedContext))
      val journalDirectory = File(directory, "private-transactions")
      val keys = PersonalKeyStore(isolatedContext, journalDirectory, "private-transactions")
      val journal = PrivateTransactionJournal(journalDirectory, keys::key,
        { it.canonicalPath.startsWith(directory.canonicalPath + File.separator) })
      val isolatedBackup = BackupCoordinator({ app.records }, { app.personal }, journal)
      isolatedBackup.recover(); app.installQaBackup(isolatedBackup, directory)
      repository.availabilityCheck = isolatedBackup::requireAvailable
      app.personal.availabilityCheck = isolatedBackup::requireAvailable
      app.installQaCompanion(CompanionRepository(isolatedContext, object : CompanionLocalPort {
        override fun exportVaultPayload(): JSONObject = app.backup.exportPayload()
        override fun mergeVaultPayload(payload: JSONObject, metadata: AtomicPrivateWrite, expectedRecordsRevision: Long, expectedPersonalRevision: Long) = app.backup.mergeVaultPayload(payload, metadata, expectedRecordsRevision, expectedPersonalRevision)
        override fun hostData(): JSONObject = app.records.currentSnapshot()
        override fun personalState(): JSONObject = app.personal.snapshot()
        override fun requireAvailable() = app.backup.requireAvailable()
        override fun clearPeerPreviews() { app.clearPersonalPreviews("partner") }
        override fun attachLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, commitOwner: () -> Unit) = app.backup.attach(expectedRecordsRevision, expectedPersonalRevision, commitOwner)
        override fun deleteLocalData() { app.backup.deleteLocalData(); app.clearPersonalPreviews() }
        override fun deleteAccountLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, metadata: AtomicPrivateWrite) {
          app.backup.deleteAccountLocalData(expectedRecordsRevision, expectedPersonalRevision, metadata); app.clearPersonalPreviews()
        }
        override fun finishAccountDeletionKeyCleanup() { app.backup.finishDeletionKeyCleanup(); app.clearPersonalPreviews() }
      }))
    }
    app.setQaRecordClock("2026-10-06T12:00:00Z")
    app.registerActivityLifecycleCallbacks(activityCallbacks)
    File(directory, "command.json").delete()
    // Reader QA preserves existing services; enablement remains an explicitly authorized external QA action.
    if (namespace == "a11y-ui") check(automation.serviceInfo != null)
    launch("today", "light")
    capture("initial")
    var last = ""
    val deadline = SystemClock.elapsedRealtime() + 30 * 60 * 1000L
    var success = true
    try {
      while (SystemClock.elapsedRealtime() < deadline) {
        val commandFile = File(directory, "command.json")
        if (!commandFile.exists()) { Thread.sleep(100); continue }
        val command = runCatching { JSONObject(commandFile.readText()) }.getOrNull() ?: continue
        val id = command.getString("id")
        if (id == last) { Thread.sleep(100); continue }
        last = id
        if (command.getString("action") == "finish") break
        check(command.getString("action") == "launch" || automation.rootInActiveWindow?.packageName?.toString() == context.packageName) { "System/permission windows must never be operated" }
        when (command.getString("action")) {
          "tap" -> gesture(command.getDouble("x").toFloat(), command.getDouble("y").toFloat())
          "swipe" -> gesture(command.getDouble("x").toFloat(), command.getDouble("y").toFloat(), command.getDouble("toX").toFloat(), command.getDouble("toY").toFloat())
          "text" -> {
            val label = command.optString("label")
            val node = find(automation.rootInActiveWindow, label)
            val bundle = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, command.getString("text")) }
            if (node?.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle) != true) {
              instrumentation.sendKeySync(KeyEvent(0, 0, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_A, 0, KeyEvent.META_CTRL_ON))
              instrumentation.sendKeySync(KeyEvent(0, 0, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_A, 0, KeyEvent.META_CTRL_ON))
              instrumentation.sendStringSync(command.getString("text"))
            }
          }
          "readerFocus" -> {
            check(preserveReaderServices && namespace == "a11y-ui")
            check(find(automation.rootInActiveWindow, command.getString("label"))?.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS) == true) { "Reader focus target missing" }
          }
          "doubleTap" -> {
            check(preserveReaderServices && namespace == "a11y-ui")
            val x = command.getDouble("x").toFloat(); val y = command.getDouble("y").toFloat()
            gesture(x, y); Thread.sleep(100); gesture(x, y)
          }
          "click" -> check(find(automation.rootInActiveWindow, command.getString("label"))?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) { "Accessible click target missing" }
          "back" -> { instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK) }
          "blur" -> instrumentation.runOnMainSync {
            val host = activeMainActivity ?: error("No active QA host")
            host.currentFocus?.clearFocus()
            (context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
              .hideSoftInputFromWindow(host.window.decorView.windowToken, 0)
          }
          "launch" -> launch(command.optString("route", "today"), command.optString("appearance", "light"), command.optString("now", "2026-10-06T12:00:00Z"))
          "locale" -> {
            check(namespace == "a11y-ui")
            val locale = command.getString("value"); check(locale in setOf("en", "zh-CN"))
            // Controlled presentation event only: no OS/application locale preference is persisted.
            app.events.dispatch("app.localeChanged", mapOf("locale" to locale))
          }
          "fontScale" -> instrumentation.runOnMainSync {
            check(namespace in setOf("personal-ui", "companion-ui", "a11y-ui"))
            val scale = command.getDouble("value").toFloat(); check(scale in 1f..2f)
            fun update(view: android.view.View) {
              if (view is com.lynx.tasm.LynxView) view.updateFontScale(scale)
              if (view is android.view.ViewGroup) for (index in 0 until view.childCount) update(view.getChildAt(index))
            }
            update((activeMainActivity ?: error("No active QA host")).window.decorView)
          }
          "viewport" -> instrumentation.runOnMainSync {
            check(namespace in setOf("personal-ui", "companion-ui", "a11y-ui"))
            val width = command.getInt("widthDp"); check(width in 320..480)
            val host = activeMainActivity ?: error("No active QA host")
            host.window.setLayout((width * host.resources.displayMetrics.density).toInt(), android.view.ViewGroup.LayoutParams.MATCH_PARENT)
          }
          "background" -> instrumentation.runOnMainSync { check(namespace in setOf("personal-ui", "a11y-ui")); (activeMainActivity ?: error("No active QA host")).moveTaskToBack(true) }
          "seedGalleryStress" -> {
            check(namespace == "a11y-ui" && context.packageName.endsWith(".uiqa"))
            fun generated(size: Int): SanitizedPhoto {
              val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888).apply { eraseColor(android.graphics.Color.rgb(100, 100, 100)) }
              val raw = java.io.ByteArrayOutputStream().apply { bitmap.compress(Bitmap.CompressFormat.PNG, 100, this) }.toByteArray(); bitmap.recycle()
              return try { PersonalImageProcessor.sanitize(raw) } finally { raw.fill(0) }
            }
            val small = generated(1024); val large = generated(2048)
            try {
              val largeCount = minOf(256, ((32L * 1024 * 1024 - small.bytes.size.toLong() * 1000) / (large.bytes.size - small.bytes.size)).toInt())
              check(largeCount >= 4)
              val total = large.bytes.size.toLong() * largeCount + small.bytes.size.toLong() * (1000 - largeCount)
              check(total <= 32L * 1024 * 1024)
              val collection = app.personal.loadCollection(); val state = collection.getJSONObject("personal")
              val photos = JSONArray(); val blobs = JSONObject(); val smallEncoded = PersonalCrypto.encode(small.bytes); val largeEncoded = PersonalCrypto.encode(large.bytes)
              for (index in 1..1000) {
                val id = "generated-stress-$index"; val image = if (index <= largeCount) large else small
                photos.put(JSONObject().put("id", id).put("date", app.records.currentSnapshot().getString("today"))
                  .put("view", "other").put("note", "Generated non-health aggregate QA pixels $index").put("createdAt", app.recordClock().instant().toString())
                  .put("mime", "image/jpeg").put("width", image.width).put("height", image.height))
                blobs.put(id, if (index <= largeCount) largeEncoded else smallEncoded)
              }
              state.put("photos", photos).put("revision", state.getLong("revision") + 1)
              collection.put("photoBytes", blobs)
              val sealed = app.personal.prepareCollection(collection)
              try { com.zzzode.leanon.data.writeBytesAtomically(app.personal.storageFile, sealed) } finally { sealed.fill(0) }
              File(directory, "gallery-stress-fixture.json").writeText(JSONObject().put("count", 1000).put("largeCount", largeCount)
                .put("largeDimensions", "2048x2048").put("smallDimensions", "1024x1024").put("totalEncodedBytes", total)
                .put("source", "Explicit cache-only generated fixture, not picker/UI save").toString(2))
            } finally { small.bytes.fill(0); large.bytes.fill(0) }
            app.events.dispatch("personal.changed", JSONObject().put("personal", app.personal.snapshot()).toJavaOnlyMap())
          }
          "seedGeneratedPhotos" -> {
            check(namespace == "personal-ui" && context.packageName.endsWith(".uiqa"))
            for (index in 1..2) {
              val bitmap = Bitmap.createBitmap(24, 18, Bitmap.Config.ARGB_8888).apply { eraseColor(android.graphics.Color.rgb(80 * index, 80 * index, 80 * index)) }
              val raw = java.io.ByteArrayOutputStream().apply { bitmap.compress(Bitmap.CompressFormat.PNG, 100, this) }.toByteArray(); bitmap.recycle()
              val image = try { PersonalImageProcessor.sanitize(raw) } finally { raw.fill(0) }
              try {
                val photo = JSONObject().put("id", "generated-ui-$index").put("date", app.records.currentSnapshot().getString("today"))
                  .put("view", "other").put("note", "Generated non-health QA pixels").put("createdAt", app.recordClock().instant().toString()).put("mime", "image/jpeg").put("width", 24).put("height", 18)
                app.personal.mutate("fixture-generated-ui-$index", app.personal.snapshot().getLong("revision"), JSONObject().put("type", "add-photo").put("photo", photo), image.bytes)
              } finally { image.bytes.fill(0) }
            }
            app.events.dispatch("personal.changed", JSONObject().put("personal", app.personal.snapshot()).toJavaOnlyMap())
          }
          "capture" -> Unit
          else -> error("Unsupported QA gesture")
        }
        instrumentation.waitForIdleSync(); Thread.sleep(command.optLong("settleMs", 900))
        val safeCommand = JSONObject(command.toString())
        val label = command.optString("label").lowercase()
        if (command.optString("action") == "text" && (label.contains("password") || label.contains("passphrase") || label.contains("invitation") || label.contains("密码") || label.contains("口令") || label.contains("邀请码"))) safeCommand.put("text", "[redacted private input]")
        actions.put(safeCommand.put("utc", Instant.now().toString()).put("completed", true))
        capture(id)
      }
    } catch (error: Throwable) {
      success = false
      File(directory, "failure-diagnostic.json").writeText(JSONObject().put("failure", error.toString()).toString())
      capture("failure")
    } finally {
      if (before != hash(originalFile) || beforePersonal != hash(originalPersonalFile) || beforeCompanion != hash(originalCompanionFile)) success = false
      val report = JSONObject().put("success", success).put("actions", actions).put("beforeRecordsSha256", before)
        .put("afterRecordsSha256", hash(originalFile)).put("fixtureRecordsSha256", hash(fixture))
        .put("fixtureSnapshot", runCatching { repository.currentSnapshot() }.getOrElse { JSONObject().put("error", it.toString()) }).put("scope", "Actual official UI actions against cache-only QA repository; no OS permissions/provider operations")
      report.put("beforePersonalSha256", beforePersonal).put("afterPersonalSha256", hash(originalPersonalFile)).put("beforeCompanionSha256", beforeCompanion).put("afterCompanionSha256", hash(originalCompanionFile))
      if (privateFlow) report.put("fixturePersonal", runCatching { app.personal.snapshot() }.getOrElse { JSONObject().put("error", it.javaClass.simpleName) })
      File(directory, "session-report.json").writeText(report.toString(2))
      app.personalPreviews.clear(); app.backup.invalidatePlans()
      if (privateFlow) app.installQaBackup(originalBackup, directory)
      app.installQaRecords(originalRepository); app.installQaPersonal(originalPersonal); app.installQaCompanion(originalCompanion); app.installQaPreviews(originalPreviews)
      app.setQaRecordClock("system")
      app.unregisterActivityLifecycleCallbacks(activityCallbacks)
      instrumentation.finish(if (success) Activity.RESULT_OK else Activity.RESULT_CANCELED, Bundle().apply { putString("report", "cache/$namespace/session-report.json") })
    }
  }
  private fun launch(route: String, mode: String, now: String = "2026-10-06T12:00:00Z") {
    context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      .putExtra("leanon_qa_route", route).putExtra("leanon_qa_appearance", mode).putExtra("leanon_qa_now", now))
    instrumentation.waitForIdleSync(); Thread.sleep(3000)
  }
  private fun gesture(x: Float, y: Float, toX: Float = x, toY: Float = y) {
    val started = SystemClock.uptimeMillis()
    fun inject(action: Int, px: Float, py: Float) {
      val pointer = MotionEvent.PointerProperties().apply { id = 0; toolType = MotionEvent.TOOL_TYPE_FINGER }
      val coordinates = MotionEvent.PointerCoords().apply { this.x = px; this.y = py; pressure = 1f; size = 1f }
      val event = MotionEvent.obtain(started, SystemClock.uptimeMillis(), action, 1,
        arrayOf(pointer), arrayOf(coordinates), 0, 0, 1f, 1f, 0, 0,
        android.view.InputDevice.SOURCE_TOUCHSCREEN, 0)
      check(automation.injectInputEvent(event, true)); event.recycle()
    }
    inject(MotionEvent.ACTION_DOWN, x, y)
    if (x != toX || y != toY) for (i in 1..12) { Thread.sleep(20); inject(MotionEvent.ACTION_MOVE, x + (toX-x)*i/12, y + (toY-y)*i/12) }
    inject(MotionEvent.ACTION_UP, toX, toY)
  }
  private fun capture(name: String) {
    val cacheCleared = if (android.os.Build.VERSION.SDK_INT >= 33) automation.clearCache() else false
    automation.takeScreenshot()?.let { bitmap ->
      File(directory, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle()
    }
    val hierarchy = JSONArray()
    fun visit(node: AccessibilityNodeInfo?) {
      if (node == null) return
      val bounds = Rect(); node.getBoundsInScreen(bounds)
      hierarchy.put(JSONObject().put("text", node.text?.toString()).put("description", node.contentDescription?.toString())
        .put("class", node.className?.toString()).put("bounds", bounds.toShortString()).put("clickable", node.isClickable)
        .put("focused", node.isFocused).put("focusable", node.isFocusable).put("accessibilityFocused", node.isAccessibilityFocused)
        .put("visibleToUser", node.isVisibleToUser).put("heading", node.isHeading).put("screenReaderFocusable", node.isScreenReaderFocusable)
        .put("editable", node.isEditable).put("inputType", node.inputType)
        .put("enabled", node.isEnabled).put("selected", node.isSelected).put("checkable", node.isCheckable).put("checked", node.isChecked)
        .put("stateDescription", if (android.os.Build.VERSION.SDK_INT >= 30) node.stateDescription?.toString() else null)
        .put("hintText", node.hintText?.toString()).put("password", node.isPassword).put("roleDescription", node.extras.getCharSequence("AccessibilityNodeInfo.roleDescription")?.toString())
        .put("actions", JSONArray(node.actionList.map { it.id })).put("widthDp", bounds.width() / context.resources.displayMetrics.density)
        .put("heightDp", bounds.height() / context.resources.displayMetrics.density))
      for (i in 0 until node.childCount) visit(node.getChild(i))
    }
    visit(automation.rootInActiveWindow)
    val imageNodes = (0 until hierarchy.length()).map { hierarchy.getJSONObject(it) }.filter { it.optString("class").contains("Image") && it.optDouble("heightDp") >= 96 }
    val metadata = JSONObject().put("accessibilityCacheCleared", cacheCleared).put("largeImageNodeCount", imageNodes.size).put("utc", Instant.now().toString()).put("pid", android.os.Process.myPid()).put("hierarchy", hierarchy)
      .put("totalPssKiB", android.os.Debug.getPss()).put("nativeHeapAllocatedBytes", android.os.Debug.getNativeHeapAllocatedSize())
      .put("javaHeapUsedBytes", Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory())
      .put("procMemory", File("/proc/self/status").readLines().filter { it.startsWith("VmRSS:") || it.startsWith("VmHWM:") })
      .put("snapshot", runCatching { app.records.currentSnapshot() }.getOrElse { JSONObject().put("error", it.toString()) })
    if (namespace in setOf("personal-ui", "companion-ui", "a11y-ui")) {
      metadata.put("personal", runCatching { app.personal.snapshot() }.getOrElse { JSONObject().put("error", it.javaClass.simpleName) })
      metadata.put("previewFiles", JSONArray(File(directory, "cache/personal-previews").listFiles()?.filter { it.isFile }?.map { JSONObject().put("name", it.name).put("bytes", it.length()) } ?: emptyList<JSONObject>()))
    }
    File(directory, "$name.json").writeText(metadata.toString(2))
    File(directory, "ready.json").writeText(JSONObject().put("id", name).put("utc", Instant.now().toString()).toString())
  }
  private fun find(node: AccessibilityNodeInfo?, label: String): AccessibilityNodeInfo? {
    if (node == null) return null
    if (label.isNotBlank() && (node.text?.toString() == label || node.contentDescription?.toString() == label)) return node
    for (i in 0 until node.childCount) find(node.getChild(i), label)?.let { return it }
    return null
  }
  private fun hash(file: File): String = if (!file.exists()) "missing" else MessageDigest.getInstance("SHA-256").digest(file.readBytes()).joinToString("") { "%02x".format(it) }
}
