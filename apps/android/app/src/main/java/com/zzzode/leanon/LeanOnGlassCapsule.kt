package com.zzzode.leanon

import android.content.Context
import android.util.AttributeSet
import com.matrix.prismal.PrismalFrameLayout

/**
 * A [PrismalFrameLayout] that ignores alpha=0 during backdrop capture.
 *
 * Prismal's `captureFromHost()` sets `alpha = 0f` to hide the capsule while
 * drawing the host view into a bitmap, then restores `alpha = 1f`.  When the
 * host does not contain the capsule (our use case: the host is the
 * navHostContainer and the capsule is its sibling), the alpha toggle is
 * unnecessary — but it still triggers an invalidation, and the GL surface
 * briefly disappears, causing a visible black flash on every capture.
 *
 * Since we never legitimately need alpha=0 on the capsule, we simply ignore
 * that specific call.
 */
class LeanOnGlassCapsule @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null,
) : PrismalFrameLayout(context, attrs) {

  override fun setAlpha(alpha: Float) {
    if (alpha > 0f) super.setAlpha(alpha)
  }
}
