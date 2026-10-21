package com.zzzode.leanon

import android.app.Application
import android.util.Log
import com.zzzode.leanon.companion.CompanionRepository
import com.zzzode.leanon.companion.CompanionMigrationController
import com.zzzode.leanon.companion.SecureCompanionStore
import com.zzzode.leanon.companion.CompanionLocalPort
import com.zzzode.leanon.personal.AtomicPrivateWrite
import org.json.JSONObject
import com.zzzode.leanon.personal.BackupCoordinator
import com.zzzode.leanon.personal.PrivateTransactionJournal
import com.zzzode.leanon.personal.PersonalKeyStore
import java.io.File
import com.zzzode.leanon.personal.PersonalRepository
import com.zzzode.leanon.personal.PersonalPreviews
import java.time.Clock
import java.time.OffsetDateTime
import com.zzzode.leanon.appearance.AppearanceRepository
import com.lynx.tasm.LynxEnv
import com.lynx.tasm.service.LynxServiceCenter
import com.lynx.service.image.LynxImageService
import com.facebook.drawee.backends.pipeline.Fresco
import com.facebook.imagepipeline.core.ImagePipelineConfig
import com.facebook.imagepipeline.cache.MemoryCacheParams
import com.zzzode.leanon.personal.ApprovedPhotoImageService
import com.zzzode.leanon.personal.BoundedPhotoDecoder
import com.zzzode.leanon.bridge.CapabilityRegistry
import com.zzzode.leanon.bridge.GlobalEventDispatcher
import com.zzzode.leanon.bridge.LynxModuleBootstrap
import com.zzzode.leanon.container.BundleResourceProvider
import com.zzzode.leanon.container.DefaultBundleResourceProvider
import com.zzzode.leanon.ble.BleScaleManager
import com.zzzode.leanon.data.RecordsRepository
import com.zzzode.leanon.data.toJavaOnlyMap
import com.zzzode.leanon.data.SettingsRepository
import com.zzzode.leanon.reminders.Notifier
import com.zzzode.leanon.reminders.ReminderScheduler
import com.zzzode.leanon.healthconnect.HealthConnectManager
import com.zzzode.leanon.navigation.NativeRouter

/** Process-wide entry point: initializes Lynx and wires host singletons. */
class LeanOnApplication : Application() {
  @Volatile private var qaRecordClock: Clock? = null

  fun recordClock(): Clock = qaRecordClock ?: Clock.systemDefaultZone()

  /** An explicit disposable QA fixture clock, never accepted by the production app. */
  fun setQaRecordClock(value: String): Boolean {
    if (!BuildConfig.DEBUG || !packageName.endsWith(".uiqa")) return false
    if (value == "system") { qaRecordClock = null; return true }
    val parsed = runCatching { OffsetDateTime.parse(value) }.getOrNull() ?: return false
    qaRecordClock = Clock.fixed(parsed.toInstant(), parsed.offset)
    return true
  }

  /** Official instrumentation may replace only its disposable QA repository. */
  fun installQaRecords(repository: RecordsRepository) {
    check(BuildConfig.DEBUG && packageName.endsWith(".uiqa")) { "QA repository override is unavailable" }
    repository.availabilityCheck = backup::requireAvailable
    records = repository
  }

  internal fun installQaCompanion(repository: CompanionRepository) {
    check(BuildConfig.DEBUG && packageName.endsWith(".uiqa")); companion = repository
  }
  internal fun installQaPreviews(previews: PersonalPreviews) {
    check(BuildConfig.DEBUG && packageName.endsWith(".uiqa")); personalPreviews = previews
  }
  internal lateinit var companion: CompanionRepository
    private set
  internal lateinit var companionFactory: () -> CompanionRepository
  internal lateinit var migration: CompanionMigrationController
  internal val companionOperationLock = Any()
  internal lateinit var backup: BackupCoordinator
    private set
  internal fun installQaBackup(coordinator: BackupCoordinator, fixtureDirectory: File) {
    check(com.zzzode.leanon.personal.qaBackupOverrideAllowed(BuildConfig.DEBUG, packageName, cacheDir, fixtureDirectory))
    backup = coordinator
  }
  internal lateinit var personal: PersonalRepository
    private set
  internal lateinit var personalPreviews: PersonalPreviews
    private set
  internal fun clearPersonalPreviews(scope: String? = null) {
    try { personalPreviews.clear(scope) }
    finally {
      // Plaintext photo pixels must not outlive their authorized preview files.
      if (Fresco.hasBeenInitialized()) Fresco.getImagePipeline().clearMemoryCaches()
      events.dispatch("app.photoPreviewsInvalidated", mapOf("scope" to (scope ?: "all")))
    }
  }

  internal fun installQaPersonal(repository: PersonalRepository) {
    check(BuildConfig.DEBUG && packageName.endsWith(".uiqa")); repository.availabilityCheck = backup::requireAvailable; personal = repository
  }

  lateinit var appearance: AppearanceRepository
    private set

  lateinit var capabilities: CapabilityRegistry
    private set
  lateinit var events: GlobalEventDispatcher
    private set
  lateinit var resourceProvider: BundleResourceProvider
    private set
  lateinit var records: RecordsRepository
    private set
  lateinit var scaleManager: BleScaleManager
    private set
  lateinit var settings: SettingsRepository
    private set
  lateinit var notifier: Notifier
    private set
  lateinit var reminderScheduler: ReminderScheduler
    private set
  lateinit var healthConnect: HealthConnectManager
    private set
  lateinit var router: NativeRouter
    private set

  override fun onCreate() {
    super.onCreate()
    appearance = AppearanceRepository(this)
    appearance.applyPlatformPreference()
    // Initialize the Lynx engine before any other Lynx API is touched. The
    // container supplies its own asset-backed template provider.
    val noPhotoCache = com.facebook.common.internal.Supplier { MemoryCacheParams(0, 0, 0, 0, 0) }
    Fresco.initialize(this, ImagePipelineConfig.newBuilder(this).setDiskCacheEnabled(false)
      .setImageDecoder(BoundedPhotoDecoder())
      .setBitmapMemoryCacheParamsSupplier(noPhotoCache).setEncodedMemoryCacheParamsSupplier(noPhotoCache).build())
    LynxServiceCenter.inst().registerService(ApprovedPhotoImageService(
      approved = { uri -> ::personalPreviews.isInitialized && personalPreviews.allows(uri) },
      deliver = { uri, callback -> ::personalPreviews.isInitialized && personalPreviews.deliverApproved(uri, callback) },
    ))
    LynxEnv.inst().init(this, null, null, null)

    capabilities = CapabilityRegistry()
    events = GlobalEventDispatcher()
    resourceProvider = DefaultBundleResourceProvider(this)
    records = RecordsRepository(this, ::recordClock)
    personal = PersonalRepository(this)
    personalPreviews = PersonalPreviews(this)
    val journalDirectory = File(filesDir, "private-transactions-v1")
    val journalKeys = PersonalKeyStore(this, journalDirectory, "private-transactions")
    val journal = PrivateTransactionJournal(journalDirectory, journalKeys::key, { target ->
      val path = target.canonicalPath
      path.startsWith(filesDir.canonicalPath + File.separator) ||
        (BuildConfig.DEBUG && packageName.endsWith(".uiqa") && path.startsWith(cacheDir.canonicalPath + File.separator))
    })
    backup = BackupCoordinator({ records }, { personal }, journal)
    records.availabilityCheck = backup::requireAvailable; personal.availabilityCheck = backup::requireAvailable
    runCatching { backup.recover() }.onFailure { Log.w("LeanOn", "Private transaction recovery unavailable; saved data preserved") }
    val companionPort = object : CompanionLocalPort {
      override fun requireAvailable() = backup.requireAvailable()
      override fun exportVaultPayload(): JSONObject = backup.exportPayload()
      override fun mergeVaultPayload(payload: JSONObject, metadata: AtomicPrivateWrite, expectedRecordsRevision: Long, expectedPersonalRevision: Long) = backup.mergeVaultPayload(payload, metadata, expectedRecordsRevision, expectedPersonalRevision)
      override fun hostData(): JSONObject = records.currentSnapshot()
      override fun personalState(): JSONObject = personal.snapshot()
      override fun clearPeerPreviews() { clearPersonalPreviews("partner") }
      override fun attachLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, commitOwner: () -> Unit) = backup.attach(expectedRecordsRevision, expectedPersonalRevision, commitOwner)
      override fun deleteLocalData() { healthConnect.withLocalDataDeletion { backup.deleteLocalData(); clearPersonalPreviews() } }
      override fun deleteAccountLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, metadata: AtomicPrivateWrite) {
        healthConnect.withLocalDataDeletion { backup.deleteAccountLocalData(expectedRecordsRevision, expectedPersonalRevision, metadata); clearPersonalPreviews() }
      }
      override fun finishAccountDeletionKeyCleanup() { backup.finishDeletionKeyCleanup(); clearPersonalPreviews() }
    }
    companionFactory = { CompanionRepository(SecureCompanionStore(this), companionPort, System::currentTimeMillis) }
    companion = companionFactory()
    migration = CompanionMigrationController(this, SecureCompanionStore(this), backup, companionFactory, adopted = { companion = companionFactory(); clearPersonalPreviews() })
    migration.changed = { payload -> events.dispatch("companion.migrationChanged", payload.toJavaOnlyMap()) }
    scaleManager = BleScaleManager(this)
    settings = SettingsRepository(this)
    notifier = Notifier(this)
    reminderScheduler = ReminderScheduler(this)
    healthConnect = HealthConnectManager(this)
    router = NativeRouter()
    // Re-arm the persisted daily reminders on process start (RFC 0020).
    runCatching { reminderScheduler.applySettings(settings.getReminderSettings()) }
      .onFailure { Log.w("LeanOn", "Reminder initialization unavailable; persisted settings preserved", it) }
    LynxModuleBootstrap.initialize(this)
  }
}
