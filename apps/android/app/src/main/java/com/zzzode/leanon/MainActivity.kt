package com.zzzode.leanon

import android.animation.ValueAnimator
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.animation.Interpolator
import android.view.animation.LinearInterpolator
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
 * content behind it. A sliding pill springs between tabs on selection,
 * expanding like jelly before the move and contracting after.
 * The pill can also be dragged across tabs.
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

  // Drag state
  private var isDragging = false
  private var dragStartX = 0f
  private var dragStartTabIndex = 0
  private var pillDragStartCenterX = 0f
  private val touchSlop by lazy { ViewConfiguration.get(this).scaledTouchSlop }

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
      // Dark glass background so the bright white pill stands out.
      setGlassColor(Color.parseColor(GLASS_COLOR_DARK))
      // applyBase is calibrated for ≥120dp views; scale down for a 64dp capsule.
      setThickness(thicknessPx)
      setHeightBlurFactor(heightBlurPx)
      // Kill the aggressive 26px default (applyBase doesn't touch it).
      setChromaticAberration(0f)
      // Capture only the Lynx content behind the capsule, not the DecorView.
      setCaptureHost(contentHost)
      // Wire up drag-to-move-pill support.
      dragHandler = tabBarDragHandler
    }
    root.addView(glassCapsule)

    // Sliding pill (behind tab items, above the glass surface).
    // Centered vertically so it sits inside the capsule at rest and bubbles
    // above and below when expanded. clipChildren=false lets it draw outside.
    pill = View(this).apply {
      layoutParams = FrameLayout.LayoutParams(pillW, pillH, Gravity.CENTER_VERTICAL)
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

  private fun onTabSelected(index: Int, startExpanded: Boolean = false) {
    if (index == selectedTabIndex) return
    tabItems[selectedTabIndex].isSelected = false
    tabItems[index].isSelected = true
    selectedTabIndex = index
    positionPill(index, animate = true, startExpanded = startExpanded)

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
   * Animate the pill to the tab's icon centre.
   *
   * Three-phase jelly animation matching iOS 26:
   * 1. **Expand** — the pill suddenly grows beyond the capsule bounds (jelly pop).
   * 2. **Move** — the pill slides to the target while expanded, with a jelly wobble.
   * 3. **Contract** — the pill shrinks like jelly back to its compact rest size.
   *
   * When [startExpanded] is true (pill was dragged), the expand phase is skipped.
   *
   * We animate layoutParams.width/height rather than scaleX/scaleY because the
   * PrismalFrameLayout's GL surface swallows view property transforms.
   */
  private fun positionPill(index: Int, animate: Boolean, startExpanded: Boolean = false) {
    if (tabContainer.width == 0) return
    val tabWidth = tabContainer.width / TAB_SPECS.size
    val targetCenterX = index * tabWidth + tabWidth / 2f
    val restWidth = resources.getDimensionPixelSize(R.dimen.tab_pill_width)
    val restHeight = resources.getDimensionPixelSize(R.dimen.tab_pill_height)
    val expandedWidth = resources.getDimensionPixelSize(R.dimen.tab_pill_expanded_width)
    val expandedHeight = resources.getDimensionPixelSize(R.dimen.tab_pill_expanded_height)

    if (!animate) {
      setPillSize(restWidth, restHeight)
      pill.translationX = targetCenterX - restWidth / 2f
      return
    }

    val startCenterX = pill.translationX + pill.width / 2f

    // Calculate active phase durations (skip expand if already expanded,
    // skip move if already at the target).
    val expandDuration = if (startExpanded) 0L else PILL_EXPAND_DURATION_MS
    val skipMove = abs(targetCenterX - startCenterX) < 1f
    val moveDuration = if (skipMove) 0L else PILL_MOVE_DURATION_MS
    val contractDuration = PILL_CONTRACT_DURATION_MS
    val totalDuration = expandDuration + moveDuration + contractDuration

    if (totalDuration <= 0L) {
      setPillSize(restWidth, restHeight)
      pill.translationX = targetCenterX - restWidth / 2f
      return
    }

    val expandEnd = expandDuration.toFloat() / totalDuration
    val moveEnd = (expandDuration + moveDuration).toFloat() / totalDuration

    if (startExpanded) {
      setPillSize(expandedWidth, expandedHeight)
    }

    val moveInterpolator = JellyInterpolator(PILL_MOVE_OVERSHOOT_TENSION)

    pillAnimator?.cancel()
    pillAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = totalDuration
      interpolator = LinearInterpolator() // Per-phase easing handled below
      addUpdateListener { anim ->
        val t = anim.animatedValue as Float

        // Phase 1: Expand (jelly pop — overshoot beyond expanded size)
        // Phase 2: Move (stay expanded, slide with jelly wobble)
        // Phase 3: Contract (jelly shrink — overshoot below rest size)
        val (width, height) = when {
          t < expandEnd -> {
            val f = t / expandEnd
            val eased = OvershootInterpolator(PILL_EXPAND_TENSION).getInterpolation(f)
            val w = (restWidth + (expandedWidth - restWidth) * eased).toInt()
            val h = (restHeight + (expandedHeight - restHeight) * eased).toInt()
            w to h
          }
          t < moveEnd -> expandedWidth to expandedHeight
          else -> {
            val f = (t - moveEnd) / (1f - moveEnd)
            val eased = OvershootInterpolator(PILL_CONTRACT_TENSION).getInterpolation(f)
            val w = (expandedWidth - (expandedWidth - restWidth) * eased).toInt()
            val h = (expandedHeight - (expandedHeight - restHeight) * eased).toInt()
            w to h
          }
        }

        val centerX = when {
          t < expandEnd -> startCenterX
          t < moveEnd -> {
            val f = (t - expandEnd) / (moveEnd - expandEnd)
            val eased = moveInterpolator.getInterpolation(f)
            startCenterX + (targetCenterX - startCenterX) * eased
          }
          else -> targetCenterX
        }

        setPillSize(width, height)
        pill.translationX = centerX - width / 2f
      }
    }
    pillAnimator?.start()
  }

  /** Set the pill's layout size and keep the corner radius proportional (always a capsule). */
  private fun setPillSize(width: Int, height: Int) {
    val lp = pill.layoutParams
    if (lp.width != width || lp.height != height) {
      lp.width = width
      lp.height = height
      pill.layoutParams = lp
    }
    (pill.background as? GradientDrawable)?.cornerRadius = height / 2f
  }

  // endregion

  // region Pill drag

  private val tabBarDragHandler = object : LeanOnGlassCapsule.TabBarDragHandler {

    override fun shouldInterceptTouch(ev: MotionEvent): Boolean {
      when (ev.action) {
        MotionEvent.ACTION_DOWN -> {
          dragStartX = ev.rawX
          isDragging = false
          return false // Let children (tab items) get the down event
        }
        MotionEvent.ACTION_MOVE -> {
          if (!isDragging && abs(ev.rawX - dragStartX) > touchSlop) {
            isDragging = true
            dragStartTabIndex = selectedTabIndex
            pillDragStartCenterX = pill.translationX + pill.width / 2f
            dragStartX = ev.rawX // Reset so dx is relative to drag start
            expandPillForDrag()
          }
          return isDragging
        }
      }
      return false
    }

    override fun handleDragTouch(ev: MotionEvent): Boolean {
      when (ev.action) {
        MotionEvent.ACTION_MOVE -> {
          if (isDragging) {
            // Cancel the expand animation if still running so we control size directly.
            pillAnimator?.cancel()

            val expandedWidth = resources.getDimensionPixelSize(R.dimen.tab_pill_expanded_width)
            val expandedHeight = resources.getDimensionPixelSize(R.dimen.tab_pill_expanded_height)
            val tabWidth = tabContainer.width / TAB_SPECS.size

            val dx = ev.rawX - dragStartX
            val newCenterX = pillDragStartCenterX + dx
            // Clamp so the pill stays within the capsule horizontally.
            val halfExpanded = expandedWidth / 2f
            val clampedX = newCenterX.coerceIn(halfExpanded, glassCapsule.width - halfExpanded)

            // Liquid stretch: elongate when between tabs, relax when over one.
            val nearestTab = (clampedX / tabWidth).toInt()
              .coerceIn(0, TAB_SPECS.size - 1)
            val nearestTabCenter = nearestTab * tabWidth + tabWidth / 2f
            val distanceFromTab = abs(clampedX - nearestTabCenter)
            val stretch = (distanceFromTab / (tabWidth / 2f)).coerceIn(0f, 1f)
            val w = (expandedWidth * (1f + stretch * DRAG_STRETCH_FACTOR)).toInt()
            val h = (expandedHeight * (1f - stretch * DRAG_COMPRESS_FACTOR)).toInt()

            setPillSize(w, h)
            pill.translationX = clampedX - w / 2f

            // Highlight the tab the pill is currently hovering over.
            if (nearestTab != selectedTabIndex) {
              tabItems[selectedTabIndex].isSelected = false
              tabItems[nearestTab].isSelected = true
              selectedTabIndex = nearestTab
            }
          }
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          if (isDragging) {
            isDragging = false
            settlePillFromDrag()
          }
        }
      }
      return true
    }
  }

  /** Expand the pill from its current size to the expanded size, keeping its center fixed. */
  private fun expandPillForDrag() {
    val expandedWidth = resources.getDimensionPixelSize(R.dimen.tab_pill_expanded_width)
    val expandedHeight = resources.getDimensionPixelSize(R.dimen.tab_pill_expanded_height)
    val centerX = pill.translationX + pill.width / 2f
    val startWidth = pill.width
    val startHeight = pill.height

    if (startWidth == expandedWidth && startHeight == expandedHeight) return

    pillAnimator?.cancel()
    pillAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = PILL_EXPAND_DURATION_MS
      interpolator = OvershootInterpolator(PILL_EXPAND_TENSION)
      addUpdateListener { anim ->
        val fraction = anim.animatedValue as Float
        val w = (startWidth + (expandedWidth - startWidth) * fraction).toInt()
        val h = (startHeight + (expandedHeight - startHeight) * fraction).toInt()
        setPillSize(w, h)
        pill.translationX = centerX - w / 2f
      }
    }
    pillAnimator?.start()
  }

  /** After a drag, animate the pill to its rest size at the nearest tab. */
  private fun settlePillFromDrag() {
    val centerX = pill.translationX + pill.width / 2f
    val tabWidth = tabContainer.width / TAB_SPECS.size
    val nearestTab = (centerX / tabWidth).toInt().coerceIn(0, TAB_SPECS.size - 1)
    positionPill(nearestTab, animate = true, startExpanded = true)

    // Navigate to the new destination if the drag actually changed tabs.
    if (nearestTab != dragStartTabIndex) {
      val spec = TAB_SPECS[nearestTab]
      navController.navigate(spec.route) {
        popUpTo(navController.graph.startDestinationId) { saveState = true }
        launchSingleTop = true
        restoreState = true
      }
      lastTabSwitchTime = System.currentTimeMillis()
      backdropHandler.postDelayed({
        glassCapsule.updateBackground()
      }, TAB_SWITCH_SETTLE_MS)
    }
  }

  // endregion

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

    // Dark glass tint so the bright white pill stands out (iOS 26 style).
    const val GLASS_COLOR_DARK = "#991A1A1A"

    // Three-phase jelly animation durations.
    const val PILL_EXPAND_DURATION_MS = 150L
    const val PILL_MOVE_DURATION_MS = 350L
    const val PILL_CONTRACT_DURATION_MS = 200L

    // Jelly interpolator tensions.
    const val PILL_EXPAND_TENSION = 3.0f
    const val PILL_MOVE_OVERSHOOT_TENSION = 2.5f
    const val PILL_CONTRACT_TENSION = 1.5f

    // Drag stretch: how much the pill elongates (and compresses vertically)
    // when pulled away from a tab centre.
    const val DRAG_STRETCH_FACTOR = 0.5f
    const val DRAG_COMPRESS_FACTOR = 0.2f

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
