package com.zzzode.leanon.modules

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.ReadableMap

/** Native module backing the `notification.*` methods. */
class NotificationModule(context: Context) : LynxModule(context) {

  @LynxMethod
  fun schedule(params: ReadableMap, callback: Callback) {
    // TODO: schedule/cancel local notifications and WorkManager jobs from
    // {enabled, reminderTypes, quietHours}; callback {ok: true}
  }
}
