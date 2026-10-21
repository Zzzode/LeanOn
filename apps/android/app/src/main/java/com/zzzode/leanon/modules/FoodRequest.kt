package com.zzzode.leanon.modules

import com.lynx.react.bridge.ReadableMap
import com.lynx.react.bridge.ReadableType
import com.zzzode.leanon.scanner.ProductBarcode

internal fun productBarcode(params: ReadableMap?): String? {
  if (params == null || !params.hasKey("barcode") || params.getType("barcode") != ReadableType.String) return null
  return params.getString("barcode")?.let(ProductBarcode::normalize)
}
