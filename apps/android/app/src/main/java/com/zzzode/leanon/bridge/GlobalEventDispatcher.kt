package com.zzzode.leanon.bridge

import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.tasm.LynxView

/**
 * Pushes native -> JS global events through the bound [LynxView]. The JS
 * transport reads the first parameter as the event payload.
 */
class GlobalEventDispatcher {

  private var view: LynxView? = null

  fun bind(view: LynxView) {
    this.view = view
  }

  fun unbind() {
    view = null
  }

  fun dispatch(event: String, payload: Any?) {
    // sendGlobalEvent takes a JavaOnlyArray parameter list; wrap one payload so
    // the JS transport can read it as args[0].
    view?.sendGlobalEvent(event, JavaOnlyArray.of(payload))
  }
}
