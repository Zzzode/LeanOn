package com.zzzode.leanon

import android.app.Application
import com.lynx.tasm.LynxEnv
import com.zzzode.leanon.bridge.CapabilityRegistry
import com.zzzode.leanon.bridge.GlobalEventDispatcher
import com.zzzode.leanon.bridge.LynxModuleBootstrap
import com.zzzode.leanon.container.BundleResourceProvider
import com.zzzode.leanon.container.DefaultBundleResourceProvider
import com.zzzode.leanon.ble.BleScaleManager
import com.zzzode.leanon.data.RecordsRepository
import com.zzzode.leanon.data.SettingsRepository
import com.zzzode.leanon.reminders.Notifier
import com.zzzode.leanon.reminders.ReminderScheduler
import com.zzzode.leanon.healthconnect.HealthConnectManager

/** Process-wide entry point: initializes Lynx and wires host singletons. */
class LeanOnApplication : Application() {

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

  override fun onCreate() {
    super.onCreate()
    // Initialize the Lynx engine before any other Lynx API is touched. The
    // container supplies its own asset-backed template provider.
    LynxEnv.inst().init(this, null, null, null)

    capabilities = CapabilityRegistry()
    events = GlobalEventDispatcher()
    resourceProvider = DefaultBundleResourceProvider(this)
    records = RecordsRepository(this)
    scaleManager = BleScaleManager(this)
    settings = SettingsRepository(this)
    notifier = Notifier(this)
    reminderScheduler = ReminderScheduler(this)
    healthConnect = HealthConnectManager(this)
    // Re-arm the persisted daily reminders on process start (RFC 0020).
    reminderScheduler.applySettings(settings.getReminderSettings())
    LynxModuleBootstrap.initialize(this)
  }
}
