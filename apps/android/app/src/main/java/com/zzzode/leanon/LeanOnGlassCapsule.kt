package com.zzzode.leanon

import android.content.Context
import android.util.AttributeSet
import android.view.MotionEvent
import com.matrix.prismal.PrismalFrameLayout

/**
 * Thin subclass of [PrismalFrameLayout] reserved for LeanOn-specific
 * customisations.
 *
 * Supports a [TabBarDragHandler] so the activity can intercept horizontal
 * drags on the tab bar (to move the pill) while still letting taps fall
 * through to the tab items.
 */
class LeanOnGlassCapsule @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null,
) : PrismalFrameLayout(context, attrs) {

  var dragHandler: TabBarDragHandler? = null

  /**
   * Callbacks for the tab-bar drag gesture.
   *
   * [shouldInterceptTouch] is called from [onInterceptTouchEvent] for every
   * touch event; return true to start intercepting (once true, the capsule
   * receives all subsequent events via [handleDragTouch]).
   */
  interface TabBarDragHandler {
    fun shouldInterceptTouch(ev: MotionEvent): Boolean
    fun handleDragTouch(ev: MotionEvent): Boolean
  }

  override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
    val handler = dragHandler ?: return super.onInterceptTouchEvent(ev)
    return handler.shouldInterceptTouch(ev)
  }

  override fun onTouchEvent(ev: MotionEvent): Boolean {
    val handler = dragHandler ?: return super.onTouchEvent(ev)
    return handler.handleDragTouch(ev)
  }
}
