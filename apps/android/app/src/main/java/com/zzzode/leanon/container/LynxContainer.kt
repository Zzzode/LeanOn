package com.zzzode.leanon.container

import android.app.Activity
import android.view.ViewGroup
import com.lynx.tasm.LynxView
import com.zzzode.leanon.bridge.CapabilityRegistry
import com.zzzode.leanon.bridge.GlobalEventDispatcher
import com.zzzode.leanon.bridge.LeanOnModuleAuthValidator

/**
 * Owns the [LynxView] for the single-activity shell and loads routes through
 * the injected [BundleResourceProvider]. Views are reused across routes.
 */
class LynxContainer(
  @Suppress("unused") private val activity: Activity,
  private val capabilities: CapabilityRegistry,
  private val resourceProvider: BundleResourceProvider,
  private val events: GlobalEventDispatcher,
) {
  private var lynxView: LynxView? = null

  fun attach(parent: ViewGroup) {
    // Build with LynxViewBuilder for the pinned Lynx version:
    //  - registerModuleAuthValidator(LeanOnModuleAuthValidator(capabilities))
    //  - install the bundle loader backed by resourceProvider
    val view: LynxView = TODO("create the LynxView via LynxViewBuilder")
    lynxView = view
    events.bind(view)
    parent.addView(view)
  }

  /** Resolve a route and load its template, optionally with init data. */
  fun loadRoute(route: String, initData: Map<String, Any?>? = null) {
    val bundle = resourceProvider.load(route)
    // lynxView.loadTemplate(bundle, initData)
    @Suppress("UNUSED_EXPRESSION") bundle
  }

  fun detach() {
    events.unbind()
    lynxView = null
  }
}
