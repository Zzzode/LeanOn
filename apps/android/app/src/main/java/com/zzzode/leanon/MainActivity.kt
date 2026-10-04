package com.zzzode.leanon

import android.animation.ValueAnimator
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.animation.Interpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.fragment.app.FragmentContainerView
import androidx.navigation.NavController
import androidx.navigation.createGraph
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.fragment.fragment
import com.matrix.prismal.PrismalLiquidGlass
import com.zzzode.leanon.ble.PermissionRequests
import com.zzzode.leanon.healthconnect.HealthConnectPermission
import com.zzzode.leanon.navigation.LynxContainerFragment
import com.zzzode.leanon.reminders.NotificationPermission
import kotlin.math.abs
import kotlin.math.sin

/**
 * Single-activity shell: a Jetpack Navigation host renders one Lynx screen per
 * destination, with a liquid-glass tab bar switching the five primary tabs.
 *
 * The tab bar is a [LeanOnGlassCapsule] capsule that renders real-time
 * refraction, Fresnel rim highlights and specular lighting over the Lynx
 * content behind it. A sliding pill springs between tabs on selection.
 * Secondary screens (e.g. Settings) are pushed over the current tab and hide
 * the bar; the system back key pops them via the NavController.
 */
class MainActivity : AppCompatActivity() {

  private lateinit var navController: NavController
  private lateinit var glassCapsule: LeanOnGlassCapsule
  private lateinit var tabContainer: LinearLayout
  private lateinit var pill: View
  private val tabItems = mutableListOf<LinearLayout>()
  private var selectedTabIndex = 0
  private var pillAnimator: ValueAnimator? = null

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

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val app = application as LeanOnApplication

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
      view.updatePadding(top = bars.top, bottom = bars.bottom)
      insets
    }

    val navHostFragment = obtainNavHostFragment(navHostContainer.id, savedInstanceState)
    navController = navHostFragment.navController
    navController.graph = buildGraph(navController)
    app.router.attach(navController)
    wireTabs()
  }

  override fun onResume() {
    super.onResume()
    backdropHandler.post(backdropRunnable)
  }

  override fun onPause() {
    super.onPause()
    backdropHandler.removeCallbacks(backdropRunnable)
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

  // region Tab bar

  private fun buildTabBar(root: FrameLayout, contentHost: ViewGroup) {
    val hMargin = resources.getDimensionPixelSize(R.dimen.floating_tab_margin)
    val bMargin = resources.getDimensionPixelSize(R.dimen.floating_tab_bottom_margin)
    val vPadding = resources.getDimensionPixelSize(R.dimen.floating_tab_vertical_padding)
    val cornerRadius = resources.getDimension(R.dimen.floating_tab_corner_radius)
    val iconSize = resources.getDimensionPixelSize(R.dimen.tab_icon_size)
    val pillW = resources.getDimensionPixelSize(R.dimen.tab_pill_width)
    val pillH = resources.getDimensionPixelSize(R.dimen.tab_pill_height)
    val itemPadV = resources.getDimensionPixelSize(R.dimen.tab_item_padding_vertical)
    val capsuleHeight = resources.getDimensionPixelSize(R.dimen.floating_tab_height)
    val thicknessPx = resources.getDimension(R.dimen.floating_tab_thickness)
    val heightBlurPx = resources.getDimension(R.dimen.floating_tab_height_blur)

    glassCapsule = LeanOnGlassCapsule(this).apply {
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        capsuleHeight,
        Gravity.BOTTOM,
      ).apply {
        leftMargin = hMargin
        rightMargin = hMargin
        bottomMargin = bMargin
      }
      // Apply the calibrated iOS optical recipe, then override for a small capsule.
      PrismalLiquidGlass.applyBase(this)
      setCornerRadius(cornerRadius)
      setBlurRadius(20f)
      setGlassColor(Color.parseColor("#30FFFFFF"))
      // applyBase is calibrated for ≥120dp views; scale down for a 64dp capsule.
      setThickness(thicknessPx)
      setHeightBlurFactor(heightBlurPx)
      // Kill the aggressive 26px default (applyBase doesn't touch it).
      setChromaticAberration(0f)
      // Capture only the Lynx content behind the capsule, not the DecorView.
      setCaptureHost(contentHost)
    }
    root.addView(glassCapsule)

    // Sliding pill (behind tab items, above the glass surface).
    // Bottom-aligned and taller than the capsule so it bubbles above the tab
    // bar like iOS 26. clipChildren=false lets it draw outside the capsule.
    pill = View(this).apply {
      layoutParams = FrameLayout.LayoutParams(pillW, pillH, Gravity.BOTTOM)
      background = ContextCompat.getDrawable(this@MainActivity, R.drawable.bg_tab_pill)
    }
    glassCapsule.clipChildren = false
    glassCapsule.addView(pill)

    // Tab items.
    tabContainer = LinearLayout(this).apply {
      layoutParams = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.WRAP_CONTENT,
        Gravity.CENTER_VERTICAL,
      )
      orientation = LinearLayout.HORIZONTAL
      setPadding(0, vPadding, 0, vPadding)
    }
    glassCapsule.addView(tabContainer)

    TAB_SPECS.forEachIndexed { index, spec ->
      tabItems.add(createTabItem(spec, index, iconSize, itemPadV))
    }
    tabItems.forEach { tabContainer.addView(it) }

    // Position the pill once layout is complete.
    tabContainer.viewTreeObserver.addOnGlobalLayoutListener(
      object : ViewTreeObserver.OnGlobalLayoutListener {
        override fun onGlobalLayout() {
          tabContainer.viewTreeObserver.removeOnGlobalLayoutListener(this)
          positionPill(selectedTabIndex, animate = false)
          glassCapsule.updateBackground()
        }
      },
    )
  }

  private fun createTabItem(spec: TabSpec, index: Int, iconSize: Int, padV: Int) =
    LinearLayout(this).apply {
      layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(0, padV, 0, padV)
      isSelected = index == selectedTabIndex

      val icon = ImageView(this@MainActivity).apply {
        layoutParams = LinearLayout.LayoutParams(iconSize, iconSize).apply {
          gravity = Gravity.CENTER_HORIZONTAL
        }
        setImageResource(spec.iconRes)
        imageTintList = ContextCompat.getColorStateList(this@MainActivity, R.color.tab_item_color)
      }
      val label = TextView(this@MainActivity).apply {
        layoutParams = LinearLayout.LayoutParams(
          ViewGroup.LayoutParams.WRAP_CONTENT,
          ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply {
          gravity = Gravity.CENTER_HORIZONTAL
          topMargin = (2 * resources.displayMetrics.density).toInt()
        }
        text = getString(spec.labelRes)
        textSize = TAB_LABEL_SIZE_SP
        gravity = Gravity.CENTER
        includeFontPadding = false
        setTextColor(ContextCompat.getColorStateList(this@MainActivity, R.color.tab_item_color))
      }
      addView(icon)
      addView(label)

      setOnClickListener { onTabSelected(index) }
    }

  private fun onTabSelected(index: Int) {
    if (index == selectedTabIndex) return
    tabItems[selectedTabIndex].isSelected = false
    tabItems[index].isSelected = true
    selectedTabIndex = index
    positionPill(index, animate = true)

    val spec = TAB_SPECS[index]
    navController.navigate(spec.route) {
      popUpTo(navController.graph.startDestinationId) { saveState = true }
      launchSingleTop = true
      restoreState = true
    }

    // Don't capture the backdrop synchronously — the fragment transition is
    // still in flight and draw() would produce a black texture. Defer until
    // the new content has had time to render.
    lastTabSwitchTime = System.currentTimeMillis()
    backdropHandler.postDelayed({
      glassCapsule.updateBackground()
    }, TAB_SWITCH_SETTLE_MS)
  }

  /**
   * Animate the pill to the tab's icon centre. While the pill is in flight it
   * stretches horizontally (and compresses vertically) in proportion to its
   * distance from the target, producing the liquid-glass "flow" effect: the
   * blob elongates as it slides and contracts with a wobble on arrival.
   *
   * We animate layoutParams.width/height rather than scaleX/scaleY because the
   * PrismalFrameLayout's GL surface swallows view property transforms.
   */
  private fun positionPill(index: Int, animate: Boolean) {
    if (tabContainer.width == 0) return
    val tabWidth = tabContainer.width / TAB_SPECS.size
    val targetCenterX = index * tabWidth + tabWidth / 2f
    val baseWidth = resources.getDimensionPixelSize(R.dimen.tab_pill_width)
    val baseHeight = resources.getDimensionPixelSize(R.dimen.tab_pill_height)

    if (!animate) {
      pill.layoutParams.width = baseWidth
      pill.layoutParams.height = baseHeight
      pill.requestLayout()
      pill.translationX = targetCenterX - baseWidth / 2f
      return
    }

    val startCenterX = pill.translationX + pill.width / 2f
    val maxDistance = abs(targetCenterX - startCenterX)

    pillAnimator?.cancel()
    pillAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = PILL_ANIM_DURATION_MS
      interpolator = JellyInterpolator(PILL_OVERSHOOT_TENSION)
      addUpdateListener { anim ->
        val fraction = anim.animatedValue as Float
        val currentCenterX = startCenterX + (targetCenterX - startCenterX) * fraction
        val distance = abs(targetCenterX - currentCenterX)
        val stretch = if (maxDistance > 0f) {
          (distance / maxDistance).coerceIn(0f, 1f)
        } else {
          0f
        }
        val newWidth = (baseWidth * (1f + stretch * PILL_STRETCH_FACTOR)).toInt()
        val newHeight = (baseHeight * (1f - stretch * PILL_COMPRESS_FACTOR)).toInt()
        val lp = pill.layoutParams
        if (lp.width != newWidth || lp.height != newHeight) {
          lp.width = newWidth
          lp.height = newHeight
          pill.layoutParams = lp
        }
        pill.translationX = currentCenterX - newWidth / 2f
      }
    }
    pillAnimator?.start()
  }

  private fun wireTabs() {
    navController.addOnDestinationChangedListener { _, destination, _ ->
      val route = destination.route
      glassCapsule.visibility = if (route in PRIMARY_ROUTES) View.VISIBLE else View.GONE
      val spec = TAB_SPECS.firstOrNull { it.route == route }
      if (spec != null) {
        val index = TAB_SPECS.indexOf(spec)
        if (index != selectedTabIndex) {
          tabItems[selectedTabIndex].isSelected = false
          tabItems[index].isSelected = true
          selectedTabIndex = index
          positionPill(index, animate = true)
        }
      }
    }
  }

  // endregion

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

    const val TAB_LABEL_SIZE_SP = 10f
    const val BACKDROP_REFRESH_MS = 200L
    const val TAB_SWITCH_SETTLE_MS = 350L

    // Liquid-glass pill: how far it stretches horizontally and compresses
    // vertically while sliding between tabs.
    const val PILL_STRETCH_FACTOR = 1.0f
    const val PILL_COMPRESS_FACTOR = 0.2f
    const val PILL_ANIM_DURATION_MS = 600L
    const val PILL_OVERSHOOT_TENSION = 2.5f

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

/**
 * Interpolator that combines an overshoot with a decaying sine-wave wobble,
 * producing the jelly-like "flow and settle" feel of iOS 26 liquid glass.
 */
private class JellyInterpolator(
  private val tension: Float = 2.5f,
  private val wobbleCount: Int = 3,
) : Interpolator {
  private val overshoot = OvershootInterpolator(tension)

  override fun getInterpolation(input: Float): Float {
    val base = overshoot.getInterpolation(input)
    val decay = 1f - input
    val wobble = (sin(input * Math.PI * wobbleCount) * decay * WOBBLE_AMPLITUDE).toFloat()
    return base + wobble
  }

  private companion object {
    const val WOBBLE_AMPLITUDE = 0.06f
  }
}
