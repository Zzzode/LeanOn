package com.zzzode.leanon.modules

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.ReadableMap

/** Native module backing the `storage.*` methods; backed by encrypted storage (RFC 0008). */
class StorageModule(context: Context) : LynxModule(context) {

  @LynxMethod
  fun get(params: ReadableMap, callback: Callback) {
    // TODO: encrypted read of {key}; callback {value: String?}
  }

  @LynxMethod
  fun set(params: ReadableMap, callback: Callback) {
    // TODO: encrypted write of {key, value}; callback {ok: true}
  }

  @LynxMethod
  fun remove(params: ReadableMap, callback: Callback) {
    // TODO: remove {key}; callback {ok: true}
  }
}
