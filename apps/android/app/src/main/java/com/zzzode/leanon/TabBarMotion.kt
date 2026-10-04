package com.zzzode.leanon

import kotlin.math.abs
import kotlin.math.sqrt

/** Retargeting preserves velocity; small integration steps keep delayed frames stable. */
internal class TabBarSpring(
  dampingRatio: Float,
  private val stiffness: Float,
  private val threshold: Float,
) {
  private val damping = 2f * dampingRatio * sqrt(stiffness)
  var value = 0f
    private set
  var velocity = 0f
    private set
  var target = 0f
  val isSettled get() = abs(value - target) < threshold && abs(velocity) < threshold * 10f

  fun snapTo(value: Float) {
    this.value = value
    target = value
    velocity = 0f
  }

  fun advance(seconds: Float) {
    var remaining = seconds.coerceIn(0f, 0.064f)
    while (remaining > 0f) {
      val dt = remaining.coerceAtMost(1f / 120f)
      velocity += (-stiffness * (value - target) - damping * velocity) * dt
      value += velocity * dt
      remaining -= dt
    }
    if (isSettled) snapTo(target)
  }
}

/** Horizontal scrubbing previews tabs. Only a valid release commits a destination. */
internal class TabBarGesture(private val touchSlop: Float) {
  private var downX = 0f
  private var downY = 0f
  private var downCenter = 0f
  private var downIndex = 0
  var isDragging = false
    private set
  var isCanceled = false
    private set

  fun begin(x: Float, y: Float, index: Int, center: Float) {
    downX = x
    downY = y
    downCenter = center
    downIndex = index
    isDragging = false
    isCanceled = false
  }

  fun move(x: Float, y: Float): Float? {
    if (isCanceled) return null
    val dx = x - downX
    val dy = y - downY
    if (!isDragging) {
      if (abs(dy) > touchSlop && abs(dy) > abs(dx)) {
        cancel()
        return null
      }
      if (abs(dx) <= touchSlop || abs(dx) <= abs(dy)) return null
      isDragging = true
    }
    return downCenter + dx
  }

  fun release(releasedIndex: Int, hoveredIndex: Int): Int? = when {
    isCanceled -> null
    isDragging -> hoveredIndex
    releasedIndex == downIndex -> downIndex
    else -> null
  }

  fun cancel() {
    isCanceled = true
    isDragging = false
  }
}
