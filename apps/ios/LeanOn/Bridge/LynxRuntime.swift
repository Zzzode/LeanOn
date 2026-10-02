import Foundation
import Lynx

/// One-time Lynx environment setup, called from AppDelegate. Native modules
/// are registered as each capability lands in later slices.
enum LynxRuntime {

  static func initialize() {
    _ = LynxEnv.sharedInstance()
  }
}
