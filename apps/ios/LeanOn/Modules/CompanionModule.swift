import Foundation
import Lynx

@objc(LeanOnCompanionModule)
final class CompanionModule: NSObject, LynxModule {
  private static let worker = DispatchQueue(label: "com.zzzode.leanon.companion-io")
  private let injected: CompanionService?
  private let publish: ((String, NSDictionary) -> Void)?
  @objc override init() { injected = nil; publish = nil; super.init() }
  @objc init(param: Any) { injected = nil; publish = nil; super.init() }
  init(service: CompanionService, publish: ((String, NSDictionary) -> Void)? = nil) { injected = service; self.publish = publish; super.init() }
  @objc static var name: String { "companion" }
  @objc static var methodLookup: [String: String] {
    ["getMigrationState": NSStringFromSelector(#selector(getMigrationState(_:callback:))),
     "previewMigration": NSStringFromSelector(#selector(previewMigration(_:callback:))),
     "startMigration": NSStringFromSelector(#selector(startMigration(_:callback:))),
     "resumeMigration": NSStringFromSelector(#selector(resumeMigration(_:callback:))),
     "pauseMigration": NSStringFromSelector(#selector(pauseMigration(_:callback:))),
     "rollbackMigration": NSStringFromSelector(#selector(rollbackMigration(_:callback:))),
     "getState": NSStringFromSelector(#selector(getState(_:callback:))),
     "configure": NSStringFromSelector(#selector(configure(_:callback:))),
     "register": NSStringFromSelector(#selector(register(_:callback:))),
     "login": NSStringFromSelector(#selector(login(_:callback:))),
     "logout": NSStringFromSelector(#selector(logout(_:callback:))),
     "deleteAccount": NSStringFromSelector(#selector(deleteAccount(_:callback:))),
     "confirmAccountDeletionLocalData": NSStringFromSelector(#selector(confirmAccountDeletionLocalData(_:callback:))),
     "createInvitation": NSStringFromSelector(#selector(createInvitation(_:callback:))),
     "acceptInvitation": NSStringFromSelector(#selector(acceptInvitation(_:callback:))),
     "confirmInvitation": NSStringFromSelector(#selector(confirmInvitation(_:callback:))),
     "cancelInvitation": NSStringFromSelector(#selector(cancelInvitation(_:callback:))),
     "setSharing": NSStringFromSelector(#selector(setSharing(_:callback:))),
     "attachLocalData": NSStringFromSelector(#selector(attachLocalData(_:callback:))),
     "sync": NSStringFromSelector(#selector(sync(_:callback:))),
     "sendEncouragement": NSStringFromSelector(#selector(sendEncouragement(_:callback:))),
     "unlink": NSStringFromSelector(#selector(unlink(_:callback:)))]
  }
  @objc func getState(_ params: Any?, callback: @escaping (NSDictionary) -> Void) { execute("getState", params: [:], callback: callback) }
  @objc func configure(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { execute("configure", params: params, callback: callback) }
  @objc func register(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { execute("register", params: params, callback: callback) }
  @objc func login(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { execute("login", params: params, callback: callback) }
  @objc func logout(_ params: Any?, callback: @escaping (NSDictionary) -> Void) { execute("logout", params: [:], callback: callback) }
  @objc func deleteAccount(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { execute("deleteAccount", params: params, callback: callback) }
  @objc func confirmAccountDeletionLocalData(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { execute("confirmAccountDeletionLocalData", params: params, callback: callback) }
  @objc func createInvitation(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { execute("createInvitation", params: params, callback: callback) }
  @objc func acceptInvitation(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { execute("acceptInvitation", params: params, callback: callback) }
  @objc func confirmInvitation(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { execute("confirmInvitation", params: params, callback: callback) }
  @objc func cancelInvitation(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { execute("cancelInvitation", params: params, callback: callback) }
  @objc func setSharing(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { execute("setSharing", params: params, callback: callback) }
  @objc func attachLocalData(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { execute("attachLocalData", params: params, callback: callback) }
  @objc func sync(_ params: Any?, callback: @escaping (NSDictionary) -> Void) { execute("sync", params: [:], callback: callback) }
  @objc func sendEncouragement(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { execute("sendEncouragement", params: params, callback: callback) }
  @objc func unlink(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { execute("unlink", params: params, callback: callback) }
  @objc func getMigrationState(_ params: Any?, callback: @escaping (NSDictionary) -> Void) { migration("state", params: [:], callback: callback) }
  @objc func previewMigration(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { migration("preview", params: params, callback: callback) }
  @objc func startMigration(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { migration("start", params: params, callback: callback) }
  @objc func resumeMigration(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { migration("resume", params: params, callback: callback) }
  @objc func pauseMigration(_ params: Any?, callback: @escaping (NSDictionary) -> Void) { migration("pause", params: [:], callback: callback) }
  @objc func rollbackMigration(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { migration("rollback", params: params, callback: callback) }
  private func migration(_ action: String, params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    DispatchQueue.main.async {
      let registry = ServiceRegistry.shared
      let work = {
        let response: NSDictionary
        do {
          guard let manager = registry.migration else { throw CompanionError.persistence }
          let allowed: Set<String> = action == "preview" ? ["targetEndpoint", "password"] : action == "start" ? ["previewToken", "password", "backupPassword", "consent"] : action == "resume" ? ["password", "backupPassword", "consent"] : action == "rollback" ? ["consent"] : []
          guard let request = params as? [String: Any], Set(request.keys).isSubset(of: allowed) else { throw CompanionError.invalidRequest }
          func text(_ key: String) throws -> String { guard let value = request[key] as? String, !value.isEmpty, value.count <= 2048 else { throw CompanionError.invalidRequest }; return value }
          switch action {
          case "preview": response = try manager.preview(endpoint: text("targetEndpoint"), password: text("password"))
          case "start": response = try manager.start(token: text("previewToken"), password: text("password"), backupPassword: text("backupPassword"), consent: request["consent"] as? Bool == true)
          case "resume": response = try manager.publish(password: text("password"), backupPassword: text("backupPassword"), consent: request["consent"] as? Bool == true)
          case "pause": response = try manager.pause()
          case "rollback": response = try manager.rollback(consent: request["consent"] as? Bool == true)
          default: response = try manager.state()
          }
          if ["start", "resume", "rollback"].contains(action) {
            registry.backup.invalidatePreviews()
            if let host = try? registry.recordsStore.currentSnapshot() { self.emit("records.changed", ["hostData": host]) }
            if let personal = try? registry.personal.snapshot() { self.emit("personal.changed", ["personal": personal]) }
            if let companion = try? registry.companion.execute("getState") { self.emit("companion.changed", companion) }
          }
        } catch { response = ["code": (error as? CompanionError)?.code ?? (error as? RecordTransactionError)?.code ?? "unavailable", "message": "Migration operation could not be completed", "retriable": Self.retriable(error)] }
        DispatchQueue.main.async { callback(response) }
      }
      if action == "pause" || action == "state" { DispatchQueue.global(qos: .userInitiated).async(execute: work) }
      else { Self.worker.async(execute: work) }
    }
  }
  private func execute(_ action: String, params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    // Registry initialization constructs UIKit services and stays on the main thread.
    DispatchQueue.main.async {
      let service = self.injected ?? ServiceRegistry.shared.companion
      Self.worker.async {
        let response: NSDictionary
        do {
          guard let request = params as? [String: Any] else { throw CompanionError.invalidRequest }
          response = try service.execute(action, params: request)
          if action != "getState" {
            let state: NSDictionary = ["companion": response["companion"]!, "runtime": response["runtime"]!]
            self.emit("companion.changed", state)
            if let host = response["hostData"] { self.emit("records.changed", ["hostData": host]) }
            if let personal = response["personal"] { self.emit("personal.changed", ["personal": personal]) }
          }
        } catch {
          let code = (error as? CompanionError)?.code ?? (error as? RecordTransactionError)?.code ?? "unavailable"
          if case CompanionError.previewCleanupPending = error, let revoked = try? service.revokedProjection() {
            self.emit("companion.changed", revoked)
          }
          if let pending = try? service.storage.read({ $0["pendingAccountDeletion"] is [String: Any] }), pending,
            let projection = try? service.revokedProjection() { self.emit("companion.changed", projection) }
          #if DEBUG
          if Bundle.main.bundleIdentifier == "com.zzzode.leanon.uiqa" {
            if case NativeCryptoError.keychainStatus(let status) = error {
              NSLog("[LeanOnCompanionQA] action=%@ code=%@ case=keychain status=%d", action, code, status)
            } else {
              let kind = error is NativeCryptoError ? "native-crypto" : error is CompanionError ? "companion" : error is RecordTransactionError ? "transaction" : "other"
              NSLog("[LeanOnCompanionQA] action=%@ code=%@ case=%@", action, code, kind)
            }
          }
          #endif
          response = ["code": code, "message": "Companion operation could not be completed", "retriable": Self.retriable(error)]
        }
        DispatchQueue.main.async { callback(response) }
      }
    }
  }
  private func emit(_ event: String, _ payload: NSDictionary) {
    DispatchQueue.main.async {
      if let publish = self.publish { publish(event, payload) }
      else { ServiceRegistry.shared.events.dispatch(event, payload: payload) }
    }
  }
  private static func retriable(_ error: Error) -> Bool {
    if case CompanionError.previewCleanupPending = error { return true }
    if case CompanionError.accountDeletionPending = error { return true }
    if case CompanionError.accountDeletionLocalDataChanged = error { return true }
    if case CompanionError.accountDeletionKeyCleanupConflict = error { return true }
    if case CompanionError.http(_, let retriable) = error { return retriable }
    return !(error is CompanionError) && !(error is RecordTransactionError)
  }
}
