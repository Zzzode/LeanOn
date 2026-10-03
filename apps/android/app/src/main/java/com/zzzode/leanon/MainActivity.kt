package com.zzzode.leanon

import android.os.Bundle
import android.view.ViewGroup
import android.widget.LinearLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.fragment.app.FragmentContainerView
import androidx.navigation.NavController
import androidx.navigation.createGraph
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.fragment.fragment
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.zzzode.leanon.ble.PermissionRequests
import com.zzzode.leanon.healthconnect.HealthConnectPermission
import com.zzzode.leanon.navigation.LynxContainerFragment
import com.zzzode.leanon.reminders.NotificationPermission

/**
 * Single-activity shell: a Jetpack Navigation host renders one Lynx screen per
 * destination, with a Material bottom bar switching the five primary tabs.
 * Secondary screens (e.g. Settings) are pushed over the current tab and hide
 * the bar; the system back key pops them via the NavController.
 */
class MainActivity : AppCompatActivity() {

  private lateinit var navController: NavController
  private lateinit var bottomBar: BottomNavigationView

  // Registered before STARTED; Health Connect returns the granted permission set here.
  val healthConnectPermissionLauncher =
    registerForActivityResult(HealthConnectPermission.contract) { grantedPermissions ->
      HealthConnectPermission.handleResult(grantedPermissions)
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val app = application as LeanOnApplication

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      )
    }

    val navHostContainer = FragmentContainerView(this).apply {
      id = R.id.nav_host_container
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        0,
        1f,
      )
    }
    root.addView(navHostContainer)

    bottomBar = BottomNavigationView(this).apply {
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      )
    }
    addTabItems(bottomBar)
    root.addView(bottomBar)
    setContentView(root)

    // Keep Lynx content below the status bar (edge-to-edge is enforced on
    // targetSdk 35). The bottom bar consumes the navigation-bar inset itself.
    ViewCompat.setOnApplyWindowInsetsListener(navHostContainer) { view, insets ->
      val top = insets.getInsets(WindowInsetsCompat.Type.systemBars()).top
      view.updatePadding(top = top)
      insets
    }

    val navHostFragment = obtainNavHostFragment(navHostContainer.id, savedInstanceState)
    navController = navHostFragment.navController
    navController.graph = buildGraph(navController)
    app.router.attach(navController)
    wireBottomBar()
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
    (application as LeanOnApplication).router.detach()
    super.onDestroy()
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

  private fun addTabItems(bar: BottomNavigationView) {
    TAB_SPECS.forEach { spec ->
      bar.menu.add(0, spec.itemId, 0, spec.labelRes)
        .setIcon(spec.iconRes)
    }
  }

  private fun wireBottomBar() {
    bottomBar.setOnItemSelectedListener { item ->
      val route = TAB_SPECS.firstOrNull { it.itemId == item.itemId }?.route ?: return@setOnItemSelectedListener false
      navController.navigate(route) {
        // Standard primary-tab switching: keep a single start destination and
        // preserve/restore each tab's saved state.
        popUpTo(navController.graph.startDestinationId) { saveState = true }
        launchSingleTop = true
        restoreState = true
      }
      true
    }

    navController.addOnDestinationChangedListener { _, destination, _ ->
      val route = destination.route
      bottomBar.visibility = if (route in PRIMARY_ROUTES) android.view.View.VISIBLE else android.view.View.GONE
      val spec = TAB_SPECS.firstOrNull { it.route == route }
      if (spec != null) {
        val menuItem = bottomBar.menu.findItem(spec.itemId)
        if (menuItem != null && !menuItem.isChecked) menuItem.isChecked = true
      }
    }
  }

  private data class TabSpec(val itemId: Int, val route: String, val iconRes: Int, val labelRes: Int)

  private companion object {
    const val ROUTE_TODAY = "today"
    const val ROUTE_DIARY = "diary"
    const val ROUTE_PROGRESS = "progress"
    const val ROUTE_PARTNER = "partner"
    const val ROUTE_ME = "me"
    const val ROUTE_SETTINGS = "settings"

    val PRIMARY_ROUTES = listOf(ROUTE_TODAY, ROUTE_DIARY, ROUTE_PROGRESS, ROUTE_PARTNER, ROUTE_ME)

    val TAB_SPECS = listOf(
      TabSpec(R.id.nav_tab_today, ROUTE_TODAY, R.drawable.ic_tab_today, R.string.tab_today),
      TabSpec(R.id.nav_tab_diary, ROUTE_DIARY, R.drawable.ic_tab_diary, R.string.tab_diary),
      TabSpec(R.id.nav_tab_progress, ROUTE_PROGRESS, R.drawable.ic_tab_progress, R.string.tab_progress),
      TabSpec(R.id.nav_tab_partner, ROUTE_PARTNER, R.drawable.ic_tab_partner, R.string.tab_partner),
      TabSpec(R.id.nav_tab_me, ROUTE_ME, R.drawable.ic_tab_me, R.string.tab_me),
    )
  }
}
