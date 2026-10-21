import Foundation
import Lynx

@objc(LeanOnBackupModule)
final class BackupModule: NSObject, LynxModule {
  @objc static var name: String { "backup" }
  @objc static var methodLookup: [String: String] {
    ["export": NSStringFromSelector(#selector(export(_:callback:))),
     "inspectImport": NSStringFromSelector(#selector(inspectImport(_:callback:))),
     "restore": NSStringFromSelector(#selector(restore(_:callback:)))]
  }
  @objc override init() { super.init() }
  @objc init(param: Any) { super.init() }
  @objc func export(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    DispatchQueue.main.async { ServiceRegistry.shared.backupPicker.export(params, callback: callback) }
  }
  @objc func inspectImport(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    DispatchQueue.main.async { ServiceRegistry.shared.backupPicker.inspect(params, callback: callback) }
  }
  @objc func restore(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    DispatchQueue.main.async {
      let services = ServiceRegistry.shared
      NativeBackupPicker.worker.async {
        let response: NSDictionary
        do {
          try PersonalSchema.exactKeys(params, ["token", "expectedRecordsRevision", "expectedPersonalRevision"])
          let token = try PersonalSchema.id(params["token"])
          response = try services.backup.restore(token: token,
            recordsRevision: RecordSchema.integer(params["expectedRecordsRevision"], "expectedRecordsRevision"),
            personalRevision: RecordSchema.integer(params["expectedPersonalRevision"], "expectedPersonalRevision"))
          DispatchQueue.main.async { services.didWriteRecords(response["hostData"] as! NSDictionary) }
          services.events.dispatch("personal.changed", payload: ["personal": response["personal"]!])
        } catch { response = NativePersonalError.payload(error) }
        DispatchQueue.main.async { callback(response) }
      }
    }
  }
}
