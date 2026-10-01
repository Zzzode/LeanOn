package com.zzzode.leanon.container

import android.app.Activity
import android.view.ViewGroup
import android.widget.FrameLayout
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import com.zzzode.leanon.bridge.CapabilityRegistry
import com.zzzode.leanon.bridge.GlobalEventDispatcher
import com.zzzode.leanon.data.RecordsRepository
import org.json.JSONObject

/**
 * Owns the [LynxView] for the single-activity shell and loads routes through a
 * template provider backed by packaged assets. The view is reused across routes.
 */
class LynxContainer(
  private val activity: Activity,
  @Suppress("unused") private val capabilities: CapabilityRegistry,
  @Suppress("unused") private val resourceProvider: BundleResourceProvider,
  private val events: GlobalEventDispatcher,
  private val records: RecordsRepository,
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

  /**
   * Resolve a route and render its template, seeding it with the host-owned
   * data snapshot and the system locale (RFC 0010). The page reads these via
   * `useInitData()`; writes return a fresh HostData from the native method.
   */
  fun loadRoute(route: String) {
    val uri = routeBundles[route] ?: return
    val initData = JSONObject()
      .put("hostData", records.loadHostData())
      .put("locale", systemLocale())
    lynxView?.renderTemplateUrl(uri, initData.toString())
  }

  fun detach() {
    events.unbind()
    lynxView = null
  }

  private fun systemLocale(): String {
    val locales = activity.resources.configuration.locales
    return if (locales.size() > 0) locales[0].toLanguageTag() else DEFAULT_LOCALE
  }

  private companion object {
    const val DEFAULT_LOCALE = "en-US"

    val routeBundles = mapOf(
      "home" to "main.lynx.bundle",
    )
  }
}
