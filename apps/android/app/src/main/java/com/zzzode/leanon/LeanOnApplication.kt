package com.zzzode.leanon

import android.app.Application
import com.zzzode.leanon.bridge.CapabilityRegistry
import com.zzzode.leanon.bridge.GlobalEventDispatcher
import com.zzzode.leanon.bridge.LynxModuleBootstrap
import com.zzzode.leanon.container.BundleResourceProvider
import com.zzzode.leanon.container.DefaultBundleResourceProvider

/** Process-wide entry point: initializes Lynx and wires host singletons. */
class LeanOnApplication : Application() {

  lateinit var capabilities: CapabilityRegistry
    private set
  lateinit var events: GlobalEventDispatcher
    private set
  lateinit var resourceProvider: BundleResourceProvider
    private set

  override fun onCreate() {
    super.onCreate()
    capabilities = CapabilityRegistry()
    events = GlobalEventDispatcher()
    resourceProvider = DefaultBundleResourceProvider(this)
    LynxModuleBootstrap.initialize(this)
  }
}
