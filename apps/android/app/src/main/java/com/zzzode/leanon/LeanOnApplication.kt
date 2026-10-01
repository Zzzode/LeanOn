package com.zzzode.leanon

import android.app.Application
import com.lynx.tasm.LynxEnv
import com.zzzode.leanon.bridge.CapabilityRegistry
import com.zzzode.leanon.bridge.GlobalEventDispatcher
import com.zzzode.leanon.bridge.LynxModuleBootstrap
import com.zzzode.leanon.container.BundleResourceProvider
import com.zzzode.leanon.container.DefaultBundleResourceProvider
import com.zzzode.leanon.data.RecordsRepository

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

  override fun onCreate() {
    super.onCreate()
    // Initialize the Lynx engine before any other Lynx API is touched. The
    // container supplies its own asset-backed template provider.
    LynxEnv.inst().init(this, null, null, null)

    capabilities = CapabilityRegistry()
    events = GlobalEventDispatcher()
    resourceProvider = DefaultBundleResourceProvider(this)
    records = RecordsRepository(this)
    LynxModuleBootstrap.initialize(this)
  }
}
