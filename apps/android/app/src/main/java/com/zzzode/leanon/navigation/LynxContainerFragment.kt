package com.zzzode.leanon.navigation

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import com.zzzode.leanon.LeanOnApplication
import com.zzzode.leanon.container.AssetsTemplateProvider
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
      .setTemplateProvider(AssetsTemplateProvider(requireActivity()))
      .build(requireActivity())
    view.layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT,
    )
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

  override fun onDestroyView() {
    val app = requireActivity().application as LeanOnApplication
    lynxView?.let { app.events.unbind(it) }
    lynxView = null
    rendered = false
    super.onDestroyView()
  }

  private fun renderIfNeeded() {
    if (rendered) return
    val view = lynxView ?: return
    val app = requireActivity().application as LeanOnApplication
    val route = arguments?.getString(ARG_ROUTE) ?: return
    val initData = JSONObject()
      .put("hostData", app.records.loadHostData())
      .put("route", route)
      .put("locale", systemLocale())
    rendered = true
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
