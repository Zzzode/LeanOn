import Foundation
import UIKit
import PhotosUI
import UniformTypeIdentifiers

enum NativeDocumentHost {
  static var current: UIViewController? {
    guard var host: UIViewController = ServiceRegistry.shared.router.tabBarController,
      host.viewIfLoaded?.window != nil else { return nil }
    while let presented = host.presentedViewController { host = presented }
    return host.viewIfLoaded?.window != nil && !host.isBeingDismissed && !host.isBeingPresented ? host : nil
  }
}

/// PHPicker is opened only by the explicit personal.pickPhoto request; no broad Photos or camera permission.
final class PrivatePhotoPicker: NSObject, PHPickerViewControllerDelegate {
  private let store: PersonalStore
  private let emit: (NSDictionary) -> Void
  private var pending: (request: NSDictionary, callback: (NSDictionary) -> Void)?
  private var selectionHandled = false
  init(store: PersonalStore, emit: @escaping (NSDictionary) -> Void) { self.store = store; self.emit = emit }
  func pick(_ request: NSDictionary, callback: @escaping (NSDictionary) -> Void) {
    do {
      guard pending == nil else { throw RecordTransactionError.conflict("photo picker busy") }
      _ = try RecordSchema.date(request["date"]); _ = try PersonalSchema.id(request["operationId"])
      _ = try RecordSchema.integer(request["expectedRevision"], "expectedRevision")
      guard PersonalSchema.views.contains(request["view"] as? String ?? "") else { throw RecordTransactionError.invalidRequest("view") }
      if let note = request["note"] { _ = try PersonalSchema.text(note, field: "note") }
      guard let host = NativeDocumentHost.current else { callback(["code": "unavailable", "message": "Photo picker host is unavailable"]); return }
      var configuration = PHPickerConfiguration(); configuration.filter = .images; configuration.selectionLimit = 1
      let picker = PHPickerViewController(configuration: configuration); picker.delegate = self
      pending = (request.copy() as! NSDictionary, callback)
      selectionHandled = false
      host.present(picker, animated: true)
    } catch { callback(NativePersonalError.payload(error)) }
  }
  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    guard !selectionHandled, let operation = pending else { return }
    selectionHandled = true
    picker.dismiss(animated: true)
    guard let result = results.first else { finish(["cancelled": true]); return }
    result.itemProvider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { [weak self] url, error in
      guard let self else { return }
      do {
        guard error == nil, let url else { throw RecordTransactionError.invalidRequest("selected photo") }
        let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
        guard let bytes = try handle.read(upToCount: PrivatePhotoImage.maximumInputBytes + 1),
          bytes.count <= PrivatePhotoImage.maximumInputBytes else { throw RecordTransactionError.invalidRequest("photo size") }
        let clean = try PrivatePhotoImage.sanitize(bytes), id = UUID().uuidString
        let metadata = NSMutableDictionary(dictionary: ["id": id, "date": operation.request["date"]!,
          "view": operation.request["view"]!, "createdAt": ISO8601DateFormatter().string(from: RecordsStore.currentTime()),
          "mime": "image/jpeg", "width": clean.width, "height": clean.height])
        if let note = operation.request["note"] { metadata["note"] = note }
        let response = try self.store.mutate(["operationId": operation.request["operationId"]!,
          "expectedRevision": operation.request["expectedRevision"]!, "mutation": ["type": "add-photo", "photo": metadata]], photoBytes: clean.bytes)
        DispatchQueue.main.async {
          self.emit(response["personal"] as! NSDictionary)
          self.finish(["cancelled": false, "personal": response["personal"]!, "photoId": id])
        }
      } catch { DispatchQueue.main.async { self.finish(NativePersonalError.payload(error)) } }
    }
  }
  private func finish(_ result: NSDictionary) {
    let callback = pending?.callback; pending = nil; callback?(result)
  }
}
