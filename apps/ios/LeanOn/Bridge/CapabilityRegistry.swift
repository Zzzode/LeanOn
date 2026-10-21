import Foundation

/// Single source of truth, on iOS, for the methods and events the host
/// implements. Keep these lists in sync with `LeanOnRpcContract` and
/// `LeanOnEventContract` in packages/bridge/src/contracts.ts.
final class CapabilityRegistry {

  let supportedMethods = [
    "records.getSnapshot", "records.mutate",
    "health.writeWeight", "health.writeIntake", "health.writeExercise",
    "health.writeWater", "health.setFoodFavorite", "health.writeCustomFood",
    "health.updateCustomFood", "health.deleteCustomFood", "health.writeScannedFood",
    "health.updateExercise", "health.deleteExercise", "app.getInfo", "app.getCapabilities",
    "app.openRoute", "app.setModalActive", "app.setLocale", "app.getAppearance", "app.setAppearance",
    "scanner.scanBarcode", "scanner.getStatus", "food.lookupProduct",
    "notification.getSettings", "notification.updateSettings", "notification.requestPermission",
    "healthKit.getStatus", "healthKit.requestPermission", "healthKit.setEnabled", "healthKit.sync",
    "scale.scan", "scale.connect", "scale.disconnect", "scale.getStatus",
    "backup.export", "backup.inspectImport", "backup.restore",
    "companion.getMigrationState",
    "companion.previewMigration",
    "companion.startMigration",
    "companion.resumeMigration",
    "companion.pauseMigration",
    "companion.rollbackMigration",
    "companion.getState", "companion.configure", "companion.register", "companion.login", "companion.logout",
    "companion.deleteAccount", "companion.confirmAccountDeletionLocalData", "companion.createInvitation", "companion.acceptInvitation",
    "companion.confirmInvitation", "companion.cancelInvitation", "companion.setSharing", "companion.sync",
    "companion.sendEncouragement", "companion.unlink", "companion.attachLocalData",
    "personal.getState", "personal.mutate", "personal.pickPhoto", "personal.getPhoto",
  ]

  let supportedEvents = [
    "app.lifecycle", "app.photoPreviewsInvalidated",
    "records.changed",
    "app.localeChanged",
    "app.appearanceChanged",
    "scale.discovered", "scale.reading",
    "personal.changed", "companion.changed",
  ]

  let bridgeVersion = "0.1.0"

  func supports(method: String) -> Bool { supportedMethods.contains(method) }
  func supports(event: String) -> Bool { supportedEvents.contains(event) }
}
