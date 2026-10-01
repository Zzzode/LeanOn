package com.zzzode.leanon.container

import android.app.Activity
import android.view.ViewGroup
import android.widget.FrameLayout
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import com.zzzode.leanon.bridge.CapabilityRegistry
import com.zzzode.leanon.bridge.GlobalEventDispatcher

/**
 * Owns the [LynxView] for the single-activity shell and loads routes through a
 * template provider backed by packaged assets. The view is reused across routes.
 */
class LynxContainer(
  private val activity: Activity,
  @Suppress("unused") private val capabilities: CapabilityRegistry,
  @Suppress("unused") private val resourceProvider: BundleResourceProvider,
  private val events: GlobalEventDispatcher,
) {
  private var lynxView: LynxView? = null

  fun attach(parent: ViewGroup) {
    val provider = AssetsTemplateProvider(activity)
    val view = LynxViewBuilder()
      .setTemplateProvider(provider)
      .build(activity)
    lynxView = view
    events.bind(view)
    parent.addView(
      view,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      ),
    )
  }

  /** Resolve a route and render its template, optionally with init data. */
  fun loadRoute(route: String, initData: Map<String, Any?>? = null) {
    val uri = routeBundles[route] ?: return
    // First slice: no init data; the page uses its bundled sample. The host data
    // injection (initData/global props) lands in the following slice.
    @Suppress("UNUSED_PARAMETER")
    initData
    lynxView?.renderTemplateUrl(uri, "")
  }

  fun detach() {
    events.unbind()
    lynxView = null
  }

  private companion object {
    val routeBundles = mapOf(
      "home" to "main.lynx.bundle",
    )
  }
}
