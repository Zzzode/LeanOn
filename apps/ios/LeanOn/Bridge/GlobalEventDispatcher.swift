import Lynx

/// Fans native -> JS global events out to every mounted LynxView. Each tab and
/// pushed screen owns a LynxView; all of them must receive record changes.
/// Views are held weakly in a hash table.
final class GlobalEventDispatcher {

  private let views = NSHashTable<LynxView>.weakObjects()

  func bind(_ view: LynxView) {
    views.add(view)
  }

  func dispatch(_ event: String, payload: Any?) {
    // Global events deliver a parameter list; wrap a single payload.
    for view in views.allObjects {
      view.sendGlobalEvent(event, withParams: [payload as Any])
    }
  }
}
