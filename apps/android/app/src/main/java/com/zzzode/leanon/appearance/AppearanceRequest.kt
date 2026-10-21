package com.zzzode.leanon.appearance

import com.lynx.react.bridge.ReadableMap
import com.lynx.react.bridge.ReadableType

/** A malformed native request must resolve as invalid, never throw before its callback. */
fun readAppearancePreference(params: ReadableMap): AppearancePreference? {
  if (!params.hasKey("preference") || params.getType("preference") != ReadableType.String) return null
  return AppearancePreference.parse(params.getString("preference"))
}
