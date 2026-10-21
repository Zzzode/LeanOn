package com.zzzode.leanon.navigation

import android.os.Bundle
import android.util.Log
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.zzzode.leanon.bridge.nativeEventArguments
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import com.lynx.tasm.LynxViewClient
import com.lynx.tasm.LynxError
import com.lynx.xelement.XElementBehaviors
import com.zzzode.leanon.LeanOnApplication
import com.zzzode.leanon.MainActivity
import com.zzzode.leanon.BuildConfig
import com.zzzode.leanon.container.AssetsTemplateProvider
import com.zzzode.leanon.modules.AppModule
import org.json.JSONObject

/**
 * Hosts one Lynx screen inside a Navigation destination. A single shared bundle
 * (`main.lynx.bundle`) renders the screen named by [ARG_ROUTE], passed through
 * init data. The view is rendered only after it is attached to the window so
 * Lynx lays it out and wires gesture hit-testing against its real size.
 */
class LynxContainerFragment : Fragment() {

  private var lynxView: LynxView? = null
  private var rendered = false

  override fun onCreateView(
    inflater: LayoutInflater,
    container: ViewGroup?,
    savedInstanceState: Bundle?,
  ): View {
    val app = requireActivity().application as LeanOnApplication
    val view = LynxViewBuilder()
      .setFontScale(resources.configuration.fontScale)
      .addBehaviors(XElementBehaviors().create())
      .setTemplateProvider(AssetsTemplateProvider(requireActivity()))
      .build(requireActivity())
    view.layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT,
    )
    view.addLynxViewClient(object : LynxViewClient() {
      override fun onFirstScreen() {
        if (BuildConfig.DEBUG) Log.d("LeanOnLynx", "First screen: ${arguments?.getString(ARG_ROUTE)}")
        refreshBackdropAfterRender()
      }
      override fun onPageUpdate() { refreshBackdropAfterRender() }
      override fun onReceivedError(error: LynxError) {
        Log.e("LeanOnLynx", "Render error ${error.errorCode}: ${error.summaryMessage}")
      }
      override fun onLoadFailed(message: String) {
        Log.e("LeanOnLynx", "Template load failed: $message")
      }
    })
    app.events.bind(view)
    lynxView = view
    // Render only once the view is actually attached to its window. Fragment
    // onCreateView returns before the view is added to a parent; view.post is
    // not ordered against that attach, so render from the attach callback to
    // guarantee a real size for layout and gesture hit-testing.
    view.addOnAttachStateChangeListener(
      object : View.OnAttachStateChangeListener {
        override fun onViewAttachedToWindow(v: View) {
          v.removeOnAttachStateChangeListener(this)
          renderIfNeeded()
        }
        override fun onViewDetachedFromWindow(v: View) {}
      },
    )
    return view
  }

  override fun onResume() {
    super.onResume()
    lynxView?.updateFontScale(resources.configuration.fontScale)
  }

  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    lynxView?.updateFontScale(newConfig.fontScale)
  }

  override fun onDestroyView() {
    val app = requireActivity().application as LeanOnApplication
    (activity as? MainActivity)?.clearModalFor(this)
    lynxView?.let { app.events.unbind(it) }
    lynxView = null
    rendered = false
    super.onDestroyView()
  }

  private fun refreshBackdropAfterRender() {
    // Palette events commit asynchronously in Lynx. Capture after its render,
    // not just before dispatch when the previous palette is still visible.
    lynxView?.postOnAnimation { (activity as? MainActivity)?.refreshBackdropAfterRender() }
  }

  fun requestModalDismiss(): Boolean {
    val view = lynxView?.takeIf { it.isAttachedToWindow } ?: return false
    // Dismiss only this destination's sheet; record events still fan out to
    // every mounted view through the shared dispatcher.
    view.sendGlobalEvent("app.dismissModal", nativeEventArguments(mapOf("reason" to "back")))
    return true
  }

  private fun renderIfNeeded() {
    if (rendered) return
    val view = lynxView ?: return
    val app = requireActivity().application as LeanOnApplication
    val route = arguments?.getString(ARG_ROUTE) ?: return
    val initData = JSONObject()
      .put("hostData", runCatching { app.records.currentSnapshot() }.getOrElse { JSONObject() })
      .put("route", route)
      .put("platform", "android")
      .put("supportedMethods", org.json.JSONArray(app.capabilities.supportedMethods))
      .put("locale", AppModule.preferredLocale(app) ?: systemLocale())
      .put("appearancePreference", app.appearance.preference().value)
      .put("appearance", app.appearance.resolved())
    rendered = true
    if (BuildConfig.DEBUG) Log.d("LeanOnLynx", "Render route=$route appearance=${app.appearance.resolved()}")
    view.renderTemplateUrl("main.lynx.bundle", initData.toString())
  }

  private fun systemLocale(): String {
    val locales = resources.configuration.locales
    return if (locales.size() > 0) locales[0].toLanguageTag() else DEFAULT_LOCALE
  }

  companion object {
    const val ARG_ROUTE = "route"
    private const val DEFAULT_LOCALE = "en-US"

    fun newInstance(route: String): LynxContainerFragment =
      LynxContainerFragment().apply {
        arguments = Bundle().apply { putString(ARG_ROUTE, route) }
      }
  }
}
