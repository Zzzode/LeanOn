package com.zzzode.leanon.modules

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import com.lynx.tasm.behavior.LynxContext

internal fun nativeModuleContext(context: Context): Context = (context as? LynxContext)?.getContext() ?: context
internal fun nativeModuleActivity(context: Context): Activity? {
  var current: Context? = nativeModuleContext(context)
  while (current is ContextWrapper) {
    if (current is Activity) return current.takeUnless { it.isFinishing || it.isDestroyed }
    current = current.baseContext
  }
  return null
}
