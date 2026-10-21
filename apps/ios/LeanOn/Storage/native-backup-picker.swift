import Foundation
import UIKit
import UniformTypeIdentifiers

/// Document operations are explicit user actions. PBKDF, validation and protected IO run off the UI thread.
final class NativeBackupPicker: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  static let worker = DispatchQueue(label: "com.zzzode.leanon.backup-io")
  private let coordinator: BackupCoordinator
  private let directory: URL
  private var pending: (kind: String, password: String, callback: (NSDictionary) -> Void)?
  private var handled = false
  init(coordinator: BackupCoordinator, directory: URL) { self.coordinator = coordinator; self.directory = directory }
  func export(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { start("export", params, callback) }
  func inspect(_ params: NSDictionary, callback: @escaping (NSDictionary) -> Void) { start("import", params, callback) }
  private func start(_ kind: String, _ params: NSDictionary, _ callback: @escaping (NSDictionary) -> Void) {
    do {
      guard pending == nil else { throw RecordTransactionError.conflict("document picker busy") }
      try PersonalSchema.exactKeys(params, ["password"])
      guard let password = params["password"] as? String, (12...1024).contains(password.utf8.count) else { throw RecordTransactionError.invalidRequest("backup password") }
      guard NativeDocumentHost.current != nil else { callback(["code": "unavailable", "message": "Document picker host is unavailable", "retriable": true]); return }
      pending = (kind, password, callback); handled = false
      if kind == "import" {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json, .data], asCopy: true)
        picker.allowsMultipleSelection = false; picker.delegate = self
        picker.directoryURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        if let host=NativeDocumentHost.current {present(picker,from:host)}
      } else {
        Self.worker.async { [weak self] in
          guard let self else { return }
          do {
            let bytes = try self.coordinator.exportEncrypted(password: password)
            try self.clearTemporaryFiles()
            try FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
            let url = self.directory.appendingPathComponent("LeanOn-backup-" + UUID().uuidString + ".json")
            try ProtectedAtomicBytes.write(bytes, to: url)
            DispatchQueue.main.async {
              guard self.pending != nil, let host = NativeDocumentHost.current else {
                self.finish(["code": "unavailable", "message": "Document picker host is unavailable"]); return
              }
              let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
              try? FileManager.default.createDirectory(at: documents, withIntermediateDirectories: true)
              let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true); picker.delegate = self
              picker.directoryURL = documents
              self.present(picker,from:host)
            }
          } catch { DispatchQueue.main.async { self.finish(NativePersonalError.payload(error)) } }
        }
      }
    } catch { callback(NativePersonalError.payload(error)) }
  }
  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    guard !handled else { return }; handled = true; finish(["cancelled": true])
  }
  private func present(_ picker:UIDocumentPickerViewController,from host:UIViewController) {
    picker.presentationController?.delegate=self
    host.present(picker,animated:true) {picker.presentationController?.delegate=self}
  }
  func presentationControllerDidDismiss(_ presentationController:UIPresentationController) {
    guard !handled else{return};handled=true;finish(["cancelled":true])
  }
  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard !handled, let operation = pending, let url = urls.first else { return }
    handled = true
    if operation.kind == "export" { finish(["cancelled": false, "fileName": url.lastPathComponent]); return }
    Self.worker.async { [weak self] in
      guard let self else { return }
      let response: NSDictionary
      let scoped = url.startAccessingSecurityScopedResource(); defer { if scoped { url.stopAccessingSecurityScopedResource() } }
      do {
        response = try self.coordinator.inspect(ProtectedAtomicBytes.read(url, maximumBytes: BackupCodec.maximumEnvelopeBytes), password: operation.password)
      } catch { response = NativePersonalError.payload(error) }
      DispatchQueue.main.async { self.finish(response) }
    }
  }
  private func finish(_ result: NSDictionary) {
    let callback = pending?.callback; pending = nil
    do { try clearTemporaryFiles() } catch { NSLog("[LeanOnBackup] Temporary cleanup deferred") }
    callback?(result)
  }
  func clearTemporaryFiles() throws {
    if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
  }
}
