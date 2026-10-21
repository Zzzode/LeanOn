package com.zzzode.leanon.bridge

/**
 * Single source of truth, on the Android side, for the methods and events the
 * host implements. Keep these lists in sync with `LeanOnRpcContract` and
 * `LeanOnEventContract` in packages/bridge/src/contracts.ts.
 */
class CapabilityRegistry {

  // Stub modules reject explicitly and are intentionally not advertised as implemented.
  val supportedMethods: List<String> = listOf(
    "app.getCapabilities",
    "app.getInfo",
    "app.getAppearance",
    "app.openRoute",
    "app.setLocale",
    "app.setAppearance",
    "app.setModalActive",
    "food.lookupProduct",
    "health.deleteCustomFood",
    "health.deleteExercise",
    "health.setFoodFavorite",
    "health.updateCustomFood",
    "health.updateExercise",
    "health.writeCustomFood",
    "health.writeExercise",
    "health.writeIntake",
    "health.writeScannedFood",
    "health.writeWater",
    "health.writeWeight",
    "companion.getMigrationState",
    "companion.previewMigration",
    "companion.startMigration",
    "companion.resumeMigration",
    "companion.pauseMigration",
    "companion.rollbackMigration",
    "companion.getState",
    "companion.configure",
    "companion.register",
    "companion.login",
    "companion.logout",
    "companion.deleteAccount",
    "companion.confirmAccountDeletionLocalData",
    "companion.createInvitation",
    "companion.acceptInvitation",
    "companion.confirmInvitation",
    "companion.cancelInvitation",
    "companion.setSharing",
    "companion.sync",
    "companion.sendEncouragement",
    "companion.unlink",
    "companion.attachLocalData",
    "backup.export",
    "backup.inspectImport",
    "backup.restore",
    "personal.getState",
    "personal.mutate",
    "personal.pickPhoto",
    "personal.getPhoto",
    "records.getSnapshot",
    "records.mutate",
    "healthConnect.getStatus",
    "healthConnect.requestPermission",
    "healthConnect.setEnabled",
    "healthConnect.sync",
    "notification.getSettings",
    "notification.requestPermission",
    "notification.updateSettings",
    "scale.connect",
    "scale.disconnect",
    "scale.getStatus",
    "scale.scan",
    "scanner.scanBarcode",
    "scanner.getStatus",
  )

  val supportedEvents: List<String> = listOf(
    "scale.discovered",
    "scale.reading",
    "app.lifecycle",
    "app.dismissModal",
    "app.localeChanged",
    "app.appearanceChanged",
    "records.changed",
    "personal.changed",
    "app.photoPreviewsInvalidated",
    "companion.changed",
  )

  val bridgeVersion: String = "0.1.0"

  fun supportsMethod(method: String): Boolean = supportedMethods.contains(method)

  fun supportsEvent(event: String): Boolean = supportedEvents.contains(event)
}
