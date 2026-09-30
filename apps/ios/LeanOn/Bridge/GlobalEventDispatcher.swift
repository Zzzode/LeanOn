import Lynx

/// Pushes native -> JS global events through the bound LynxView. The JS
/// transport reads the first parameter as the event payload.
final class GlobalEventDispatcher {

  private weak var view: LynxView?

  func bind(_ view: LynxView) {
    self.view = view
  }

  func dispatch(_ event: String, payload: Any?) {
    // Global events deliver a parameter list; wrap a single payload.
    view?.sendGlobalEvent(event, params: [payload as Any])
  }
}
