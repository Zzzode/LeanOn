package com.zzzode.leanon

import android.content.Context
import android.util.AttributeSet
import com.matrix.prismal.PrismalFrameLayout

/**
 * Thin subclass of [PrismalFrameLayout] reserved for LeanOn-specific
 * customisations (e.g. overriding capture-time property hacks).
 */
class LeanOnGlassCapsule @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null,
) : PrismalFrameLayout(context, attrs)
