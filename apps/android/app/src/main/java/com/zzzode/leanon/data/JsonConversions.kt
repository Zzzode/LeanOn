package com.zzzode.leanon.data

import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
import org.json.JSONArray
import org.json.JSONObject

/**
 * Converts org.json values (used for on-disk records and seed assets) into the
 * Lynx [com.lynx.react.bridge.ReadableMap] shapes returned through bridge
 * callbacks. Only the JSON -> host-map direction is needed: init data is passed
 * to the page as a JSON string, and persistence writes JSON directly.
 */
fun JSONObject.toJavaOnlyMap(): JavaOnlyMap {
  val map = JavaOnlyMap()
  val keys = keys()
  while (keys.hasNext()) {
    val key = keys.next()
    map.putJsonValue(key, get(key))
  }
  return map
}

fun JSONArray.toJavaOnlyArray(): JavaOnlyArray {
  val array = JavaOnlyArray()
  for (index in 0 until length()) {
    array.pushJsonValue(get(index))
  }
  return array
}

private fun JavaOnlyMap.putJsonValue(key: String, value: Any?) {
  when {
    value == null || value === JSONObject.NULL -> putNull(key)
    value is JSONObject -> putMap(key, value.toJavaOnlyMap())
    value is JSONArray -> putArray(key, value.toJavaOnlyArray())
    value is Boolean -> putBoolean(key, value)
    value is Number -> putDouble(key, value.toDouble())
    else -> putString(key, value.toString())
  }
}

private fun JavaOnlyArray.pushJsonValue(value: Any?) {
  when {
    value == null || value === JSONObject.NULL -> pushNull()
    value is JSONObject -> pushMap(value.toJavaOnlyMap())
    value is JSONArray -> pushArray(value.toJavaOnlyArray())
    value is Boolean -> pushBoolean(value)
    value is Number -> pushDouble(value.toDouble())
    else -> pushString(value.toString())
  }
}
