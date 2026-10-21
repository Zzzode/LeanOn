import AVFoundation
import UIKit

enum BarcodeScanResult: Equatable {
  case barcode(String), cancelled, notAuthorized, unavailable

  var payload: NSDictionary {
    switch self {
    case .barcode(let value): return ["barcode": value]
    case .cancelled: return ["cancelled": true]
    case .notAuthorized: return ["code": "not-authorized", "message": "Camera permission is required"]
    case .unavailable: return ["code": "unavailable", "message": "Camera scanning is unavailable"]
    }
  }
}

protocol BarcodeCameraAccess {
  var hasCamera: Bool { get }
  var authorization: AVAuthorizationStatus { get }
  func requestAccess(_ completion: @escaping (Bool) -> Void)
}

struct SystemBarcodeCameraAccess: BarcodeCameraAccess {
  var hasCamera: Bool {
    #if targetEnvironment(simulator)
    return false
    #else
    return AVCaptureDevice.default(for: .video) != nil
    #endif
  }
  var authorization: AVAuthorizationStatus { AVCaptureDevice.authorizationStatus(for: .video) }
  func requestAccess(_ completion: @escaping (Bool) -> Void) {
    AVCaptureDevice.requestAccess(for: .video, completionHandler: completion)
  }
}

protocol BarcodeScanPresenting {
  var hasHost: Bool { get }
  func present(completion: @escaping (BarcodeScanResult) -> Void) -> Bool
}

/// One in-flight scan across all cached Lynx tabs; rejection never replaces it.
final class BarcodeScanCoordinator {
  static let shared = BarcodeScanCoordinator()
  private let camera: BarcodeCameraAccess
  private let presenter: BarcodeScanPresenting
  private var pending: (id: UUID, completion: (BarcodeScanResult) -> Void)?

  init(camera: BarcodeCameraAccess = SystemBarcodeCameraAccess(),
       presenter: BarcodeScanPresenting = NativeBarcodeScanPresenter()) {
    self.camera = camera
    self.presenter = presenter
  }

  /// Harmless preflight; inspecting status never requests permission or opens camera UI.
  var status: NSDictionary {
    dispatchPrecondition(condition: .onQueue(.main))
    let permission: String
    switch camera.authorization {
    case .notDetermined: permission = "not-determined"
    case .authorized: permission = "authorized"
    case .denied: permission = "denied"
    case .restricted: permission = "restricted"
    @unknown default: permission = "restricted"
    }
    return ["cameraAvailable": camera.hasCamera, "permission": permission, "hostAvailable": presenter.hasHost]
  }

  func scan(completion: @escaping (BarcodeScanResult) -> Void) {
    // Module callbacks and UIKit presentation always run on the main queue.
    dispatchPrecondition(condition: .onQueue(.main))
    guard pending == nil else { completion(.unavailable); return }
    guard camera.hasCamera else { completion(.unavailable); return }
    // A detached container must not trigger a system permission dialog.
    guard presenter.hasHost else { completion(.unavailable); return }
    let id = UUID()
    pending = (id, completion)
    switch camera.authorization {
    case .authorized: present(id: id)
    case .notDetermined:
      camera.requestAccess { [weak self] granted in
        DispatchQueue.main.async {
          if granted { self?.present(id: id) }
          else { self?.finish(.notAuthorized, id: id) }
        }
      }
    case .denied, .restricted: finish(.notAuthorized, id: id)
    @unknown default: finish(.unavailable, id: id)
    }
  }

  private func present(id: UUID) {
    guard pending?.id == id else { return }
    if !presenter.present(completion: { [weak self] result in self?.finish(result, id: id) }) {
      finish(.unavailable, id: id)
    }
  }

  private func finish(_ result: BarcodeScanResult, id: UUID) {
    guard pending?.id == id else { return }
    let callback = pending?.completion
    pending = nil
    callback?(result)
  }
}

final class NativeBarcodeScanPresenter: BarcodeScanPresenting {
  var hasHost: Bool { presentationHost() != nil }

  private func presentationHost() -> UIViewController? {
    guard var host: UIViewController = ServiceRegistry.shared.router.tabBarController,
      host.viewIfLoaded?.window != nil else { return nil }
    while let presented = host.presentedViewController { host = presented }
    guard host.viewIfLoaded?.window != nil, !host.isBeingDismissed, !host.isBeingPresented else { return nil }
    return host
  }

  func present(completion: @escaping (BarcodeScanResult) -> Void) -> Bool {
    guard let host = presentationHost() else { return false }
    let scanner = BarcodeScanViewController(completion: completion)
    let navigation = UINavigationController(rootViewController: scanner)
    navigation.modalPresentationStyle = .fullScreen
    host.present(navigation, animated: true)
    return true
  }
}

enum ScannerLocale {
  static func string(_ key: String) -> String {
    let language = AppLocale.current.hasPrefix("zh") ? "zh-Hans" : "en"
    guard let path = Bundle.main.path(forResource: language, ofType: "lproj"),
      let bundle = Bundle(path: path) else { return key }
    return bundle.localizedString(forKey: key, value: key, table: "Scanner")
  }
}
