package com.zzzode.leanon

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.PI
import kotlin.math.sin
import kotlin.math.sqrt

/** Exact underdamped response keeps the same curve across display refresh rates. */
internal class TabBarSpring(
  dampingRatio: Float,
  private val stiffness: Float,
  private val threshold: Float,
) {
  private val decay = dampingRatio * sqrt(stiffness)
  private val frequency = sqrt(stiffness - decay * decay)
  init {
    require(dampingRatio >= 0f && dampingRatio < 1f && stiffness > 0f)
  }
  var value = 0f
    private set
  var velocity = 0f
    private set
  var target = 0f
  val isSettled get() = abs(value - target) < threshold && abs(velocity) < threshold * 10f

  fun snapTo(value: Float) {
    follow(value, 0f)
  }

  fun follow(value: Float, velocity: Float) {
    this.value = value
    target = value
    this.velocity = velocity
  }

  fun constrain(minimum: Float, maximum: Float) {
    value = value.coerceIn(minimum, maximum)
    if ((value == minimum && velocity < 0f) || (value == maximum && velocity > 0f)) {
      velocity = 0f
    }
  }

  fun advance(seconds: Float) {
    if (seconds <= 0f) return
    val offset = value - target
    val attenuation = exp(-decay * seconds)
    val cosine = cos(frequency * seconds)
    val sine = sin(frequency * seconds)
    val nextOffset = attenuation *
      (offset * cosine + (velocity + decay * offset) / frequency * sine)
    velocity = attenuation *
      (velocity * cosine - (decay * velocity + stiffness * offset) / frequency * sine)
    value = target + nextOffset
    if (isSettled) snapTo(target)
  }

  /** Remaining time to the first maximum, including an interrupted rising press. */
  fun secondsUntilPeak(): Float {
    if (isSettled || (value >= target && velocity <= 0f)) return 0f
    var angle = atan2(velocity * frequency, decay * velocity + stiffness * (value - target))
    if (angle < 0f) angle += (2 * PI).toFloat()
    return angle / frequency
  }
}

/** Coordinates the local lens phases without coupling them to navigation or rendering. */
internal class TabBarMotion {
  val position = TabBarSpring(0.72f, 1000f, 0.25f)
  val pressure = TabBarSpring(0.55f, 500f, 0.002f)
  val stretch = TabBarSpring(0.8f, 900f, 0.002f)
  private var lastNanos: Long? = null
  private var travelStartsAt: Long? = null
  private var destination = 0f
  private var releaseAtPeak = false
  private var dragging = false
  private var minimum = -Float.MAX_VALUE
  private var maximum = Float.MAX_VALUE
  val isTravelDelayed get() = travelStartsAt != null
  val targetCenter get() = if (isTravelDelayed) destination else position.target
  val isAnimating get() = travelStartsAt != null || releaseAtPeak ||
    (!dragging && !position.isSettled) || !pressure.isSettled || !stretch.isSettled

  fun setBounds(minimum: Float, maximum: Float) {
    this.minimum = minimum
    this.maximum = maximum
    position.constrain(minimum, maximum)
  }

  fun press(center: Float, nanos: Long) {
    advance(nanos)
    dragging = false
    releaseAtPeak = false
    destination = center
    // A resting source pill opens before travel. An interrupted move retargets
    // immediately with its existing velocity instead of stopping for another delay.
    if (position.isSettled) travelStartsAt = nanos + 40_000_000L
    else {
      travelStartsAt = null
      position.target = center
    }
    pressure.target = 1f
    stretch.target = 0f
  }

  fun moveTo(center: Float, nanos: Long) {
    advance(nanos)
    destination = center
    if (travelStartsAt == null) position.target = center
  }

  fun drag(center: Float, velocity: Float, deformation: Float, nanos: Long) {
    advance(nanos)
    travelStartsAt = null
    dragging = true
    releaseAtPeak = false
    position.follow(center, velocity)
    position.constrain(minimum, maximum)
    stretch.target = deformation
  }

  fun release(tap: Boolean, nanos: Long) {
    advance(nanos)
    dragging = false
    stretch.target = 0f
    releaseAtPeak = tap && pressure.secondsUntilPeak() > 0f
    if (!releaseAtPeak) pressure.target = 0f
  }

  fun cancel(center: Float, nanos: Long) {
    release(tap = false, nanos)
    travelStartsAt = null
    position.target = center
  }

  fun finish(center: Float) {
    travelStartsAt = null
    releaseAtPeak = false
    dragging = false
    lastNanos = null
    destination = center
    position.snapTo(center)
    pressure.snapTo(0f)
    stretch.snapTo(0f)
  }

  fun advance(nanos: Long) {
    var from = lastNanos ?: nanos
    val until = maxOf(from, nanos)
    // Split at phase boundaries so a delayed frame cannot postpone a release
    // or apply the destination spring to time spent expanding at the source.
    while (from < until) {
      val travelAt = travelStartsAt ?: Long.MAX_VALUE
      val peakAt = if (releaseAtPeak) {
        from + (pressure.secondsUntilPeak() * 1_000_000_000.0).toLong()
      } else Long.MAX_VALUE
      val to = maxOf(from, minOf(until, travelAt, peakAt))
      val dt = (to - from) / 1_000_000_000f
      if (!dragging) position.advance(dt)
      position.constrain(minimum, maximum)
      pressure.advance(dt)
      stretch.advance(dt)
      if (to >= travelAt) {
        travelStartsAt = null
        position.target = destination
      }
      if (to >= peakAt) {
        releaseAtPeak = false
        pressure.target = 0f
      }
      from = to
    }
    lastNanos = until
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
