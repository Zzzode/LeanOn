package com.zzzode.leanon.bridge

import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.tasm.LynxView
import java.util.Collections
import java.util.WeakHashMap

/**
 * Fans native -> JS global events out to every mounted [LynxView]. Each tab
 * and secondary screen owns a view; all receive record changes. Views are
 * held weakly so a destroyed view drops out automatically.
 */
class GlobalEventDispatcher {

  private val views = Collections.newSetFromMap(WeakHashMap<LynxView, Boolean>())

  fun bind(view: LynxView) {
    views.add(view)
  }

  fun unbind(view: LynxView) {
    views.remove(view)
  }

  fun unbindAll() {
    views.clear()
  }

  fun dispatch(event: String, payload: Any?) {
    // sendGlobalEvent takes a JavaOnlyArray parameter list; wrap one payload so
    // the JS transport reads it as args[0]. Snapshot first in case a view tears
    // down during dispatch.
    views.toList().forEach { it.sendGlobalEvent(event, JavaOnlyArray.of(payload)) }
  }
}
