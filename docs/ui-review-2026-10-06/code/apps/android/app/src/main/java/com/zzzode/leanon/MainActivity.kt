package com.zzzode.leanon

import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.fragment.app.FragmentContainerView
import androidx.navigation.NavController
import androidx.navigation.createGraph
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.fragment.fragment
import com.zzzode.leanon.ble.PermissionRequests
import com.zzzode.leanon.healthconnect.HealthConnectPermission
import com.zzzode.leanon.modules.AppModule
import com.zzzode.leanon.navigation.LynxContainerFragment
import com.zzzode.leanon.reminders.NotificationPermission

/**
 * Single-activity shell: a Jetpack Navigation host renders one Lynx screen per
 * destination, with a liquid-glass tab bar switching the five primary tabs.
 *
 * The tab bar is a [LeanOnGlassCapsule] capsule that renders real-time
 * refraction, Fresnel rim highlights and specular lighting over the Lynx
 * content behind it. A sliding pill springs between tabs on selection,
 * revealing a refractive lens on press and settling after release.
 * The pill can also be dragged across tabs.
 * Secondary screens (e.g. Settings) are pushed over the current tab and hide
 * the bar; the system back key pops them via the NavController.
 */
class MainActivity : AppCompatActivity() {

  private lateinit var navController: NavController
  private lateinit var glassCapsule: LeanOnGlassCapsule
  private var selectedTabIndex = 0
  private var modalActive = false
  private var modalOwner: Any? = null
  private var modalFragment: LynxContainerFragment? = null
  private var modalRoute: String? = null

  private val modalBackCallback = object : OnBackPressedCallback(false) {
    override fun handleOnBackPressed() {
      // JS owns the sheet state. Keep navigation blocked until it acknowledges
      // the dismissal, so repeated Back presses cannot pop the underlying page.
      if (modalFragment?.requestModalDismiss() != true) {
        clearModalState()
        onBackPressedDispatcher.onBackPressed()
      }
    }
  }

  // Prismal captures the backdrop on demand; poll periodically so the glass
  // stays fresh while the user scrolls the Lynx content behind it.
  private val backdropHandler = Handler(Looper.getMainLooper())
  private var lastTabSwitchTime = 0L
  private val backdropRunnable = object : Runnable {
    override fun run() {
      // Skip refresh while a tab switch is settling — the fragment transition
      // can produce a black capture if we draw mid-transition.
      if (System.currentTimeMillis() - lastTabSwitchTime > TAB_SWITCH_SETTLE_MS) {
        glassCapsule.updateBackground()
      }
      backdropHandler.postDelayed(this, BACKDROP_REFRESH_MS)
    }
  }

  // Registered before STARTED; Health Connect returns the granted permission set here.
  val healthConnectPermissionLauncher =
    registerForActivityResult(HealthConnectPermission.contract) { grantedPermissions ->
      HealthConnectPermission.handleResult(grantedPermissions)
    }

  override fun attachBaseContext(newBase: Context) {
    // Below Android 13 the app owns locale storage; restore it before
    // AppCompat wraps the activity context and inflates any native labels.
    if (Build.VERSION.SDK_INT < 33) {
      AppModule.preferredLocale(newBase)?.let { locale ->
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(locale))
      }
    }
    super.attachBaseContext(newBase)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val app = application as LeanOnApplication
    // Android 13+ persists application locales in the framework. Migrate a
    // preference from the previous bridge implementation after delegate creation.
    if (Build.VERSION.SDK_INT >= 33) {
      AppModule.preferredLocale(app)?.let { locale ->
        val locales = LocaleListCompat.forLanguageTags(locale)
        if (AppCompatDelegate.getApplicationLocales() != locales) {
          AppCompatDelegate.setApplicationLocales(locales)
        }
      }
    }

    val root = FrameLayout(this).apply {
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      )
    }

    val navHostContainer = FragmentContainerView(this).apply {
      id = R.id.nav_host_container
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      )
    }
    root.addView(navHostContainer)

    buildTabBar(root, navHostContainer)
    setContentView(root)

    // Keep Lynx content below the status bar (edge-to-edge is enforced on
    // targetSdk 35). The bottom bar floats on top of the content.
    ViewCompat.setOnApplyWindowInsetsListener(navHostContainer) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
      view.updatePadding(top = bars.top, bottom = maxOf(bars.bottom, keyboard.bottom))
      insets
    }

    val navHostFragment = obtainNavHostFragment(navHostContainer.id, savedInstanceState)
    navController = navHostFragment.navController
    navController.graph = buildGraph(navController)
    app.router.attach(navController)
    wireTabs()
    onBackPressedDispatcher.addCallback(this, modalBackCallback)
  }

  override fun onResume() {
    super.onResume()
    backdropHandler.post(backdropRunnable)
  }

  override fun onPause() {
    super.onPause()
    backdropHandler.removeCallbacksAndMessages(null)
    glassCapsule.finishInteraction()
  }

  override fun onStart() {
    super.onStart()
    // Best-effort two-way sync whenever the app comes to the foreground (RFC 0025).
    val app = application as LeanOnApplication
    if (app.settings.getHealthConnectEnabled()) {
      app.healthConnect.syncAsync { }
    }
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    PermissionRequests.handleResult(requestCode, grantResults)
    NotificationPermission.handleResult(requestCode, grantResults)
  }

  override fun onDestroy() {
    backdropHandler.removeCallbacksAndMessages(null)
    (application as LeanOnApplication).router.detach()
    modalOwner = null
    modalFragment = null
    super.onDestroy()
  }

  private fun buildTabBar(root: FrameLayout, contentHost: ViewGroup) {
    root.clipChildren = false
    glassCapsule = LeanOnGlassCapsule(this).apply {
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        resources.getDimensionPixelSize(R.dimen.floating_tab_height),
        Gravity.BOTTOM,
      ).apply {
        val margin = resources.getDimensionPixelSize(R.dimen.floating_tab_margin)
        leftMargin = margin
        rightMargin = margin
        bottomMargin = resources.getDimensionPixelSize(R.dimen.floating_tab_bottom_margin)
      }
      setCaptureHost(contentHost)
      TAB_SPECS.forEach { addTab(it.iconRes, it.labelRes) }
      onTabSelected = { index -> onTabSelected(index) }
    }
    root.addView(glassCapsule)
  }

  private fun onTabSelected(index: Int) {
    if (modalActive) return
    if (index == selectedTabIndex) return
    selectedTabIndex = index
    navController.navigate(TAB_SPECS[index].route) {
      popUpTo(navController.graph.startDestinationId) { saveState = true }
      launchSingleTop = true
      restoreState = true
    }
    lastTabSwitchTime = System.currentTimeMillis()
    backdropHandler.postDelayed({ glassCapsule.updateBackground() }, TAB_SWITCH_SETTLE_MS)
  }

  private fun wireTabs() {
    navController.addOnDestinationChangedListener { _, destination, _ ->
      val route = destination.route
      if (modalActive && route != modalRoute) clearModalState()
      if (route !in PRIMARY_ROUTES) glassCapsule.finishInteraction()
      updateTabBarVisibility()
      val index = TAB_SPECS.indexOfFirst { it.route == route }
      if (index >= 0) {
        selectedTabIndex = index
        glassCapsule.setSelectedTab(index)
      }
    }
  }

  fun setModalActive(active: Boolean, owner: Any): Boolean {
    if (active) {
      val host = supportFragmentManager.findFragmentById(R.id.nav_host_container) as? NavHostFragment
      val fragment = host?.childFragmentManager?.primaryNavigationFragment as? LynxContainerFragment
        ?: return false
      modalOwner = owner
      modalFragment = fragment
      modalRoute = navController.currentDestination?.route
      modalActive = true
      glassCapsule.finishInteraction()
    } else {
      // A disposed Lynx module may acknowledge its old sheet after the next
      // destination has opened one. Its cleanup must not expose that tab bar.
      if (modalOwner != null && modalOwner !== owner) return true
      clearModalState()
    }
    modalBackCallback.isEnabled = modalActive
    updateTabBarVisibility()
    return true
  }

  fun clearModalFor(fragment: LynxContainerFragment) {
    if (modalFragment === fragment) clearModalState()
  }

  private fun clearModalState() {
    modalActive = false
    modalOwner = null
    modalFragment = null
    modalRoute = null
    modalBackCallback.isEnabled = false
    updateTabBarVisibility()
  }

  private fun updateTabBarVisibility() {
    glassCapsule.isEnabled = !modalActive
    glassCapsule.importantForAccessibility = if (modalActive) {
      View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    } else {
      View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
    }
    glassCapsule.visibility = if (!modalActive && navController.currentDestination?.route in PRIMARY_ROUTES) {
      View.VISIBLE
    } else {
      View.GONE
    }
  }

  private fun obtainNavHostFragment(containerId: Int, savedState: Bundle?): NavHostFragment {
    val existing = supportFragmentManager.findFragmentById(containerId) as? NavHostFragment
    if (existing != null) return existing
    return NavHostFragment().also { host ->
      supportFragmentManager.beginTransaction()
        .add(containerId, host)
        .setPrimaryNavigationFragment(host)
        .commitNow()
    }
  }

  private fun buildGraph(controller: NavController) =
    controller.createGraph(startDestination = ROUTE_TODAY) {
      (PRIMARY_ROUTES + ROUTE_SETTINGS).forEach { route ->
        fragment<LynxContainerFragment>(route) {
          argument(LynxContainerFragment.ARG_ROUTE) { defaultValue = route }
        }
      }
    }

  private data class TabSpec(val route: String, val iconRes: Int, val labelRes: Int)

  private companion object {
    const val ROUTE_TODAY = "today"
    const val ROUTE_DIARY = "diary"
    const val ROUTE_PROGRESS = "progress"
    const val ROUTE_PARTNER = "partner"
    const val ROUTE_ME = "me"
    const val ROUTE_SETTINGS = "settings"

    const val BACKDROP_REFRESH_MS = 200L
    const val TAB_SWITCH_SETTLE_MS = 350L

    val PRIMARY_ROUTES = listOf(ROUTE_TODAY, ROUTE_DIARY, ROUTE_PROGRESS, ROUTE_PARTNER, ROUTE_ME)

    val TAB_SPECS = listOf(
      TabSpec(ROUTE_TODAY, R.drawable.ic_tab_today, R.string.tab_today),
      TabSpec(ROUTE_DIARY, R.drawable.ic_tab_diary, R.string.tab_diary),
      TabSpec(ROUTE_PROGRESS, R.drawable.ic_tab_progress, R.string.tab_progress),
      TabSpec(ROUTE_PARTNER, R.drawable.ic_tab_partner, R.string.tab_partner),
      TabSpec(ROUTE_ME, R.drawable.ic_tab_me, R.string.tab_me),
    )
  }
}
