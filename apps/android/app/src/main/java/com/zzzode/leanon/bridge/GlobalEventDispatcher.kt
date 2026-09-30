package com.zzzode.leanon.bridge

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
    // sendGlobalEvent delivers a parameter list; wrap a single payload.
    view?.sendGlobalEvent(event, arrayOf(payload))
  }
}
