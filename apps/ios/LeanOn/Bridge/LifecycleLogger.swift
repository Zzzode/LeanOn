import Foundation
import Lynx

/// Observes key LynxView lifecycle callbacks so template/JS/first-screen
/// progress and load errors can be diagnosed. Logging is compiled only for
/// DEBUG builds; Release builds keep the observer but stay silent.
final class LifecycleLogger: NSObject, LynxViewLifecycle {

  func lynxViewDidStartLoading(_ view: LynxView) {
    #if DEBUG
    NSLog("[LeanOnLifecycle] start loading")
    #endif
  }

  func lynxViewDidConstructJSRuntime(_ view: LynxView) {
    #if DEBUG
    NSLog("[LeanOnLifecycle] JS runtime constructed")
    #endif
  }

  func lynxViewDidFirstScreen(_ view: LynxView) {
    #if DEBUG
    NSLog("[LeanOnLifecycle] first screen rendered")
    #endif
  }

  func lynxView(_ view: LynxView, didLoadFinishedWithUrl url: String) {
    #if DEBUG
    NSLog("[LeanOnLifecycle] load finished url=\(url)")
    #endif
  }

  func lynxView(_ view: LynxView, didRecieveError error: Error) {
    #if DEBUG
    NSLog("[LeanOnLifecycle] error=\(error.localizedDescription)")
    #endif
  }
}
