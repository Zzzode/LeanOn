import Foundation

/// Single source of truth, on iOS, for the methods and events the host
/// implements. Keep these lists in sync with `LeanOnRpcContract` and
/// `LeanOnEventContract` in packages/bridge/src/contracts.ts.
final class CapabilityRegistry {

  let supportedMethods = [
    "health.authorize",
    "health.readSamples",
    "health.writeWeight",
    "scale.scan",
    "scale.connect",
    "storage.get",
    "storage.set",
    "storage.remove",
    "resource.fetch",
    "app.getInfo",
    "app.getCapabilities",
    "notification.schedule",
  ]

  let supportedEvents = [
    "health.authorizationChanged",
    "scale.discovered",
    "scale.reading",
    "app.lifecycle",
  ]

  let bridgeVersion = "0.1.0"

  func supports(method: String) -> Bool { supportedMethods.contains(method) }
  func supports(event: String) -> Bool { supportedEvents.contains(event) }
}
