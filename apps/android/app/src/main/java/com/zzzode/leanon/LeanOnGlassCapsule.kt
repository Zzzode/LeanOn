package com.zzzode.leanon

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.util.AttributeSet
import android.util.Log
import android.view.Choreographer
import android.view.Gravity
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.matrix.prismal.PrismalFrameLayout
import com.matrix.prismal.PrismalLiquidGlass
import kotlin.math.abs

/** Native tab chrome. The moving lens is outside the platter's clipping boundary. */
class LeanOnGlassCapsule @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null,
) : FrameLayout(context, attrs) {
  companion object {
    private const val TAG = "LeanOnGlassCapsule"
  }
  private val density = resources.displayMetrics.density
  private val restWidth = resources.getDimension(R.dimen.tab_pill_width)
  private val restHeight = resources.getDimension(R.dimen.tab_pill_height)
  private val expandedWidth = resources.getDimension(R.dimen.tab_pill_expanded_width)
  private val expandedHeight = resources.getDimension(R.dimen.tab_pill_expanded_height)
  private val inset = resources.getDimension(R.dimen.floating_tab_vertical_padding)
  private val motion = TabBarMotion()
  private val position = motion.position
  private val pressure = motion.pressure
  private val stretch = motion.stretch
  private val gesture = TabBarGesture(ViewConfiguration.get(context).scaledTouchSlop.toFloat())
  private val tabItems = mutableListOf<LinearLayout>()
  private var selectedIndex = 0
  private var previewIndex = -1
  private var delayedPreviewIndex: Int? = null
  private var pendingDragCenter = 0f
  private var pendingDragVelocity = 0f
  private var pendingDragStretch = 0f
  private var hasPendingDrag = false
  private var activePointerId = MotionEvent.INVALID_POINTER_ID
  private var velocityTracker: VelocityTracker? = null
  private var frameScheduled = false
  private var lastMaterialPressure = -1f
  private var lastMaterialStretch = -1f
  private var captureAfterLayout = false
  private var captureFill = ContextCompat.getColor(context, R.color.tab_capture_fill)

  var onTabSelected: ((Int) -> Unit)? = null

  // Prismal samples the material; the fixed strip handles content refraction
  // in bar coordinates, independently of asynchronous GL bitmap uploads.
  private val backdrop = object : FrameLayout(context) {
    override fun draw(canvas: Canvas) {
      // Prismal reads RGB without texture alpha. Fill pixels outside the rounded
      // platter in software captures so the expanded lens never samples black.
      if (!canvas.isHardwareAccelerated) canvas.drawColor(captureFill)
      super.draw(canvas)
    }
  }.apply {
    background = roundedBackground(ContextCompat.getColor(context, R.color.tab_platter),
      resources.getDimension(R.dimen.floating_tab_corner_radius))
    clipToOutline = true
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
  }
  private val surface = PrismalFrameLayout(context).apply {
    PrismalLiquidGlass.applyBase(this)
    setCornerRadius(resources.getDimension(R.dimen.floating_tab_corner_radius))
    setThickness(resources.getDimension(R.dimen.floating_tab_thickness))
    setHeightBlurFactor(resources.getDimension(R.dimen.floating_tab_height_blur))
    setGlassColor(Color.TRANSPARENT)
    setBlurRadius(18f)
    setBrightness(1.04f)
    setChromaticAberration(0f)
    setRimStrength(0.25f)
    setSpecular(0.25f, 88f)
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
  }
  private val tabs = createTabStrip()
  private val restOverlay = View(context).apply {
    background = roundedBackground(ContextCompat.getColor(context, R.color.tab_rest_pill), restHeight / 2f)
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
  }
  private val lens = PrismalFrameLayout(context).apply {
    PrismalLiquidGlass.applyBase(this)
    setCaptureHost(backdrop)
    setCornerRadius(restHeight / 2f)
    setThickness(dp(1.5f))
    setGlassColor(Color.TRANSPARENT)
    setBrightness(1.04f)
    setBlurRadius(0f)
    setMinSmoothing(1.8f)
    setLiquidDomeStrength(1f)
    setFresnelReflectStrength(1.4f)
    setLensRefractionScale(1.2f)
    setRimStrength(0.18f)
    setSpecular(0.35f, 88f)
    setCausticIntensity(0.08f)
    setShadowProperties(Color.argb(20, 0, 0, 0), 6f)
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    addView(restOverlay, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  private val frameCallback = Choreographer.FrameCallback { nanos ->
    frameScheduled = false
    applyPendingDrag(nanos)
    motion.advance(nanos)
    if (!motion.isTravelDelayed) {
      delayedPreviewIndex?.let(::showPreview)
      delayedPreviewIndex = null
    }
    renderLens(nanos)
    if (motion.isAnimating) {
      if (Log.isLoggable(TAG, Log.VERBOSE)) {
        Log.v(TAG, "frame: pos=${position.value}/${position.target} settled=${position.isSettled}, " +
          "pressure=${pressure.value}/${pressure.target} settled=${pressure.isSettled}, " +
          "stretch=${stretch.value}/${stretch.target} settled=${stretch.isSettled}")
      }
      scheduleFrame()
    }
  }

  init {
    clipChildren = false
    clipToPadding = false
    isClickable = true
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    // The capture layer contains ordinary views only. SurfaceView.draw() clears
    // a hole even on a software Canvas, which would erase the lens's bitmap source.
    addView(surface, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    addView(backdrop, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    addView(lens, LayoutParams(restWidth.toInt(), restHeight.toInt(), Gravity.CENTER_VERTICAL))
    // One fixed strip owns the icons, labels, rim optics and accessible targets.
    addView(tabs, LayoutParams(LayoutParams.MATCH_PARENT,
      LayoutParams.WRAP_CONTENT, Gravity.CENTER_VERTICAL))
  }

  fun addTab(iconRes: Int, labelRes: Int) {
    val index = tabItems.size
    val item = LinearLayout(context).apply {
      layoutParams = LinearLayout.LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f)
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      val padding = resources.getDimensionPixelSize(R.dimen.tab_item_padding_vertical)
      setPadding(0, padding, 0, padding)
      val iconSize = resources.getDimensionPixelSize(R.dimen.tab_icon_size)
      addView(ImageView(context).apply {
        layoutParams = LinearLayout.LayoutParams(iconSize, iconSize)
        setImageResource(iconRes)
        imageTintList = ContextCompat.getColorStateList(context, R.color.tab_item_color)
      })
      addView(createLabel().apply {
        setText(labelRes)
        setTextColor(ContextCompat.getColorStateList(context, R.color.tab_item_color))
      })
      setOnClickListener { commitSelection(index) }
      contentDescription = context.getString(labelRes)
      importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
      for (i in 0 until childCount) {
        getChildAt(i).importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
      }
    }
    tabItems.add(item)
    tabs.addView(item)
    tabs.invalidateOpticalSource()
    showPreview(selectedIndex)
  }

  fun setCaptureHost(host: ViewGroup) = surface.setCaptureHost(host)

  /** Change contrast/material only; geometry, selection and spring state stay intact. */
  fun applyAppearance(themedContext: Context) {
    captureFill = ContextCompat.getColor(themedContext, R.color.tab_capture_fill)
    backdrop.background = roundedBackground(
      ContextCompat.getColor(themedContext, R.color.tab_platter),
      resources.getDimension(R.dimen.floating_tab_corner_radius),
    )
    restOverlay.background = roundedBackground(
      ContextCompat.getColor(themedContext, R.color.tab_rest_pill), restHeight / 2f,
    )
    val colors = ContextCompat.getColorStateList(themedContext, R.color.tab_item_color)
    tabItems.forEach { item ->
      (item.getChildAt(0) as ImageView).imageTintList = colors
      (item.getChildAt(1) as TextView).setTextColor(colors)
    }
    backdrop.invalidate()
    tabs.invalidateOpticalSource()
    // Refresh immediately even during a settling tab transition, instead of
    // letting the old light/dark capture linger until the periodic poll.
    if (isAttachedToWindow) {
      surface.updateBackground()
      lens.updateBackground()
    }
    invalidate()
  }

  fun refreshBackdropAfterRender() {
    if (!isAttachedToWindow || visibility != VISIBLE) return
    surface.updateBackground()
    lens.updateBackground()
  }

  fun updateBackground() {
    // Keep full-page software capture out of the interaction's frame budget.
    // The next regular refresh picks up the destination once the lens settles.
    if (isAttachedToWindow && visibility == VISIBLE &&
        activePointerId == MotionEvent.INVALID_POINTER_ID && !frameScheduled) {
      surface.updateBackground()
    }
  }

  fun setSelectedTab(index: Int, animate: Boolean = true) {
    if (index !in tabItems.indices) return
    selectedIndex = index
    if (width == 0) return
    motion.moveTo(tabCenter(index), System.nanoTime())
    if (motion.isTravelDelayed) delayedPreviewIndex = index else showPreview(index)
    if (animate && ValueAnimator.areAnimatorsEnabled()) scheduleFrame()
    else {
      motion.finish(tabCenter(index))
      delayedPreviewIndex = null
      showPreview(index)
      renderLens()
    }
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    if (changed && tabItems.isNotEmpty()) {
      // A small elastic excursion is allowed; a fast release cannot escape the bar.
      motion.setBounds(clampCenter(-Float.MAX_VALUE) - dp(4f),
        clampCenter(Float.MAX_VALUE) + dp(4f))
      Log.d(TAG, "onLayout: changed=$changed, size=${right-left}x${bottom-top}, " +
        "selectedIndex=$selectedIndex, posTarget=${position.target}, posValue=${position.value}")
      finishInteraction()
      captureAfterLayout = true
      scheduleFrame()
    }
  }

  // Owning DOWN as well as MOVE gives immediate feedback. Accessible tabs keep
  // their OnClickListeners for TalkBack and keyboard activation.
  override fun onInterceptTouchEvent(event: MotionEvent): Boolean = true

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (tabItems.isEmpty()) return false
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        Log.d(TAG, "onTouchEvent: ACTION_DOWN at (${event.x}, ${event.y})")
        hasPendingDrag = false
        activePointerId = event.getPointerId(0)
        velocityTracker?.recycle()
        velocityTracker = VelocityTracker.obtain().also { it.addMovement(event) }
        val index = nearestTab(event.x)
        gesture.begin(event.x, event.y, index, tabCenter(index))
        delayedPreviewIndex = index
        motion.press(tabCenter(index), System.nanoTime())
        parent?.requestDisallowInterceptTouchEvent(true)
        scheduleFrame()
      }
      MotionEvent.ACTION_MOVE -> {
        val pointer = event.findPointerIndex(activePointerId)
        if (pointer < 0) {
          releaseGesture(commit = false)
          return true
        }
        trackDrag(event, pointer)
        if (gesture.isCanceled) releaseGesture(commit = false)
        else scheduleFrame()
      }
      MotionEvent.ACTION_UP -> {
        if (activePointerId != MotionEvent.INVALID_POINTER_ID) {
          val pointer = event.findPointerIndex(activePointerId)
          if (gesture.isDragging && pointer >= 0) trackDrag(event, pointer)
          val index = if (event.y in 0f..height.toFloat() && event.x in 0f..width.toFloat()) {
            val releasedIndex = nearestTab(event.x)
            gesture.release(releasedIndex, releasedIndex)
          } else if (gesture.isDragging) nearestTab(event.x) else null
          releaseGesture(commit = index != null, pulse = index != null && !gesture.isDragging)
          if (index != null) tabItems[index].performClick()
        }
      }
      MotionEvent.ACTION_POINTER_UP -> {
        if (event.getPointerId(event.actionIndex) == activePointerId) {
          releaseGesture(commit = false)
        }
      }
      MotionEvent.ACTION_CANCEL -> releaseGesture(commit = false)
    }
    return true
  }

  private fun releaseGesture(commit: Boolean, pulse: Boolean = false) {
    applyPendingDrag()
    activePointerId = MotionEvent.INVALID_POINTER_ID
    velocityTracker?.recycle()
    velocityTracker = null
    gesture.cancel()
    motion.release(tap = pulse, System.nanoTime())
    if (!commit && tabItems.isNotEmpty()) {
      delayedPreviewIndex = null
      showPreview(selectedIndex)
      motion.cancel(tabCenter(selectedIndex), System.nanoTime())
    }
    parent?.requestDisallowInterceptTouchEvent(false)
    scheduleFrame()
  }

  override fun performClick(): Boolean = super.performClick()

  private fun commitSelection(index: Int) {
    val changed = index != selectedIndex
    setSelectedTab(index)
    if (changed) onTabSelected?.invoke(index)
  }

  fun finishInteraction() {
    releaseGesture(commit = false)
    Choreographer.getInstance().removeFrameCallback(frameCallback)
    frameScheduled = false
    motion.finish(if (tabItems.isNotEmpty()) tabCenter(selectedIndex) else position.target)
    delayedPreviewIndex = null
    renderLens()
  }

  override fun onDetachedFromWindow() {
    finishInteraction()
    super.onDetachedFromWindow()
  }

  private fun trackDrag(event: MotionEvent, pointer: Int) {
    velocityTracker?.addMovement(event)
    val center = gesture.move(event.getX(pointer), event.getY(pointer)) ?: return
    pendingDragCenter = clampCenter(center)
    velocityTracker?.computeCurrentVelocity(1000)
    val velocity = velocityTracker?.getXVelocity(activePointerId) ?: 0f
    // Keep release momentum bounded and stop outward travel at the platter ends.
    pendingDragVelocity = if ((center <= clampCenter(-Float.MAX_VALUE) && velocity < 0f) ||
        (center >= clampCenter(Float.MAX_VALUE) && velocity > 0f)) 0f
      else velocity.coerceIn(-dp(1200f), dp(1200f))
    pendingDragStretch = (abs(velocity) / dp(3500f)).coerceIn(0f, 0.18f)
    hasPendingDrag = true
  }

  private fun applyPendingDrag(nanos: Long = System.nanoTime()) {
    if (!hasPendingDrag) return
    motion.drag(pendingDragCenter, pendingDragVelocity, pendingDragStretch, nanos)
    delayedPreviewIndex = null
    hasPendingDrag = false
    showPreview(nearestTab(position.value))
  }

  private fun showPreview(index: Int) {
    if (index == previewIndex) return
    previewIndex = index
    tabItems.forEachIndexed { i, item -> item.isSelected = i == index }
    tabs.invalidateOpticalSource()
  }

  private fun tabCenter(index: Int): Float {
    val item = tabItems[index]
    return clampCenter(tabs.left + item.left + item.width / 2f)
  }

  private fun nearestTab(center: Float): Int = tabItems.indices.minBy {
    abs(tabCenter(it) - center)
  }

  private fun clampCenter(center: Float): Float {
    val half = restWidth / 2f + inset
    if (width <= half * 2f) return width / 2f
    return center.coerceIn(half, width - half)
  }

  private fun renderLens(nanos: Long = 0L) {
    // Geometry keeps both sides of the spring: expansion overshoot and the
    // brief compression below resting size. Material opacity stays bounded.
    val sizePressure = pressure.value.coerceIn(-0.2f, 1.2f)
    val p = pressure.value.coerceIn(0f, 1f)
    val deformation = stretch.value.coerceIn(0f, 0.2f)
    lens.translationX = position.value - restWidth / 2f
    lens.pivotX = restWidth / 2f
    lens.pivotY = restHeight / 2f
    lens.scaleX = (1f + (expandedWidth / restWidth - 1f) * sizePressure) * (1f + deformation)
    lens.scaleY = (1f + (expandedHeight / restHeight - 1f) * sizePressure) * (1f - deformation * 0.4f)
    tabs.setLens(position.value - tabs.left, lens.top + restHeight / 2f - tabs.top,
      restWidth, restHeight, lens.scaleX, lens.scaleY, p)
    // Only ordinary native views crossfade; SurfaceView alpha is not portable before API 34.
    restOverlay.alpha = 1f - p.coerceAtMost(1f)
    // Optical strength and geometry follow the same display frame. The source
    // texture is still captured only after layout, independently of these uniforms.
    if (abs(p - lastMaterialPressure) > 0.002f || (p == 0f && lastMaterialPressure != 0f)) {
      lens.setChromaticAberration(6f * p)
      lens.setHeightBlurFactor(dp(6f + 12f * p))
      lastMaterialPressure = p
    }
    if (abs(deformation - lastMaterialStretch) > 0.002f ||
        (deformation == 0f && lastMaterialStretch != 0f)) {
      lens.setLightDirection(-0.5f + deformation, -0.8f)
      lastMaterialStretch = deformation
    }
    // This material has no moving tab pixels, so its texture needs one upload
    // after layout, rather than an asynchronous recapture on every drag frame.
    if (nanos != 0L && captureAfterLayout) {
      lens.updateBackground()
      captureAfterLayout = false
    }
  }

  private fun scheduleFrame() {
    if (frameScheduled || !isAttachedToWindow || visibility != VISIBLE) return
    if (!ValueAnimator.areAnimatorsEnabled()) {
      applyPendingDrag()
      motion.finish(motion.targetCenter)
      delayedPreviewIndex?.let(::showPreview)
      delayedPreviewIndex = null
      renderLens()
      return
    }
    frameScheduled = true
    Choreographer.getInstance().postFrameCallback(frameCallback)
  }

  private fun createLabel() = TextView(context).apply {
    layoutParams = LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT,
      LayoutParams.WRAP_CONTENT).apply { topMargin = dp(2f).toInt() }
    textSize = 10f
    gravity = Gravity.CENTER
    includeFontPadding = false
  }

  private fun createTabStrip() = TabBarRefractionStrip(context).apply {
    orientation = LinearLayout.HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    val hPadding = resources.getDimensionPixelSize(R.dimen.floating_tab_horizontal_padding)
    val vPadding = resources.getDimensionPixelSize(R.dimen.floating_tab_vertical_padding)
    setPadding(hPadding, vPadding, hPadding, vPadding)
  }

  private fun roundedBackground(color: Int, radius: Float) = GradientDrawable().apply {
    setColor(color)
    cornerRadius = radius
  }

  private fun dp(value: Float) = value * density
}
