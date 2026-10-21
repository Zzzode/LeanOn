import AVFoundation
import ObjectiveC.runtime
import XCTest
@testable import LeanOn

final class BarcodeScannerTests: XCTestCase {
  private final class Camera: BarcodeCameraAccess {
    var hasCamera = true
    var authorization: AVAuthorizationStatus = .authorized
    var requests = 0
    var permission: ((Bool) -> Void)?
    func requestAccess(_ completion: @escaping (Bool) -> Void) { requests += 1; permission = completion }
  }
  private final class Presenter: BarcodeScanPresenting {
    var available = true
    var hasHost: Bool { available }
    var callbacks: [(BarcodeScanResult) -> Void] = []
    func present(completion: @escaping (BarcodeScanResult) -> Void) -> Bool {
      if available { callbacks.append(completion) }
      return available
    }
  }

  func testNoCameraAndDeniedPermissionHaveDistinctErrorsWithoutPromptOrPresentation() {
    let camera = Camera()
    let presenter = Presenter()
    let coordinator = BarcodeScanCoordinator(camera: camera, presenter: presenter)
    for status: AVAuthorizationStatus in [.authorized, .denied, .restricted] {
      camera.hasCamera = status != .authorized
      camera.authorization = status
      var result: BarcodeScanResult?
      coordinator.scan { result = $0 }
      XCTAssertEqual(result, status == .authorized ? .unavailable : .notAuthorized)
    }
    XCTAssertEqual(camera.requests, 0)
    XCTAssertTrue(presenter.callbacks.isEmpty)
  }

  func testCancelCompletesOnceAndOldCallbacksCannotCompleteANewScan() {
    let presenter = Presenter()
    let coordinator = BarcodeScanCoordinator(camera: Camera(), presenter: presenter)
    var first: [BarcodeScanResult] = []
    coordinator.scan { first.append($0) }
    presenter.callbacks[0](.cancelled)
    presenter.callbacks[0](.barcode("12345678"))
    XCTAssertEqual(first, [.cancelled])
    var second: [BarcodeScanResult] = []
    coordinator.scan { second.append($0) }
    presenter.callbacks[0](.unavailable)
    XCTAssertTrue(second.isEmpty)
    presenter.callbacks[1](.barcode("12345678"))
    XCTAssertEqual(second, [.barcode("12345678")])
  }

  func testConcurrentRequestFailsWithoutReplacingPendingScan() {
    let presenter = Presenter()
    let coordinator = BarcodeScanCoordinator(camera: Camera(), presenter: presenter)
    var first: BarcodeScanResult?
    var second: BarcodeScanResult?
    coordinator.scan { first = $0 }
    coordinator.scan { second = $0 }
    XCTAssertEqual(second, .unavailable)
    XCTAssertNil(first)
    XCTAssertEqual(presenter.callbacks.count, 1)
    presenter.callbacks[0](.barcode("5901234123457"))
    XCTAssertEqual(first, .barcode("5901234123457"))
  }

  func testAuthorizationIsOnlyRequestedByScanAndDenialResolves() {
    let camera = Camera()
    camera.authorization = .notDetermined
    let presenter = Presenter()
    let coordinator = BarcodeScanCoordinator(camera: camera, presenter: presenter)
    XCTAssertEqual(camera.requests, 0)
    let complete = expectation(description: "permission denial")
    coordinator.scan { result in XCTAssertEqual(result, .notAuthorized); complete.fulfill() }
    XCTAssertEqual(camera.requests, 1)
    XCTAssertTrue(presenter.callbacks.isEmpty)
    camera.permission?(false)
    wait(for: [complete], timeout: 2)
    XCTAssertTrue(presenter.callbacks.isEmpty)
  }

  func testUnavailableHostResolvesBeforeRequestingPermission() {
    let camera = Camera()
    camera.authorization = .notDetermined
    let presenter = Presenter()
    presenter.available = false
    let coordinator = BarcodeScanCoordinator(camera: camera, presenter: presenter)
    let complete = expectation(description: "unavailable presentation")
    coordinator.scan { result in XCTAssertEqual(result, .unavailable); complete.fulfill() }
    wait(for: [complete], timeout: 2)
    XCTAssertEqual(camera.requests, 0)
    XCTAssertNil(camera.permission)
    XCTAssertTrue(presenter.callbacks.isEmpty)
  }

  func testGrantedPermissionPresentsOnlyAfterTheUserScanRequest() {
    let camera = Camera()
    camera.authorization = .notDetermined
    let presenter = Presenter()
    let coordinator = BarcodeScanCoordinator(camera: camera, presenter: presenter)
    let complete = expectation(description: "authorized scan completed")
    coordinator.scan { result in XCTAssertEqual(result, .cancelled); complete.fulfill() }
    XCTAssertEqual(camera.requests, 1)
    XCTAssertTrue(presenter.callbacks.isEmpty)
    camera.permission?(true)
    let presented = expectation(description: "presentation after authorization callback")
    DispatchQueue.main.async {
      XCTAssertEqual(presenter.callbacks.count, 1)
      presenter.callbacks.first?(.cancelled)
      presented.fulfill()
    }
    wait(for: [presented, complete], timeout: 2)
  }

  func testReadOnlyStatusDistinguishesHardwarePermissionAndHostWithoutRequestingAccess() {
    let camera = Camera()
    let presenter = Presenter()
    let coordinator = BarcodeScanCoordinator(camera: camera, presenter: presenter)
    let cases: [(AVAuthorizationStatus, String)] = [(.notDetermined, "not-determined"),
      (.authorized, "authorized"), (.denied, "denied"), (.restricted, "restricted")]
    for (authorization, label) in cases {
      camera.authorization = authorization
      for available in [false, true] {
        camera.hasCamera = available
        presenter.available = available
        let status = coordinator.status
        XCTAssertEqual(status["cameraAvailable"] as? Bool, available)
        XCTAssertEqual(status["permission"] as? String, label)
        XCTAssertEqual(status["hostAvailable"] as? Bool, available)
      }
    }
    XCTAssertEqual(camera.requests, 0)
    XCTAssertNil(camera.permission)
    XCTAssertTrue(presenter.callbacks.isEmpty)
  }

  func testReadOnlyStatusVoidModuleCallbackDoesNotTriggerScan() {
    let camera = Camera()
    camera.authorization = .notDetermined
    let presenter = Presenter()
    let module = ScannerModule(coordinator: BarcodeScanCoordinator(camera: camera, presenter: presenter))
    let done = expectation(description: "status callback")
    done.assertForOverFulfill = true
    module.getStatus(nil) {
      XCTAssertTrue(Thread.isMainThread)
      XCTAssertEqual($0["cameraAvailable"] as? Bool, true)
      XCTAssertEqual($0["permission"] as? String, "not-determined")
      XCTAssertEqual($0["hostAvailable"] as? Bool, true)
      done.fulfill()
    }
    wait(for: [done], timeout: 2)
    XCTAssertEqual(camera.requests, 0)
    XCTAssertTrue(presenter.callbacks.isEmpty)
  }

  func testUPCAMatchesAndroidAndEAN13IsPreserved() {
    XCTAssertEqual(BarcodeScanViewController.normalizedBarcode("0036000291452", type: .ean13), "0036000291452")
    XCTAssertEqual(BarcodeScanViewController.normalizedBarcode("5901234123457", type: .ean13), "5901234123457")
    XCTAssertEqual(BarcodeScanViewController.normalizedBarcode("96385074", type: .ean8), "96385074")
    XCTAssertEqual(BarcodeScanViewController.normalizedBarcode("04252614", type: .upce), "0042100005264")
    XCTAssertEqual(BarcodeScanViewController.normalizedBarcode("0042100005264", type: .ean13), "0042100005264")
    XCTAssertEqual(BarcodeScanViewController.normalizedBarcode("042100005264", type: .code128), "0042100005264")
    XCTAssertNil(BarcodeScanViewController.normalizedBarcode("04252615", type: .upce))
    XCTAssertNil(BarcodeScanViewController.normalizedBarcode("arbitrary code text", type: .code128))
    XCTAssertEqual(BarcodeScanResult.cancelled.payload["cancelled"] as? Bool, true)
    XCTAssertEqual(BarcodeScanResult.notAuthorized.payload["code"] as? String, "not-authorized")
    XCTAssertEqual(BarcodeScanResult.unavailable.payload["code"] as? String, "unavailable")
  }

  func testSimulatorCameraIsExplicitlyUnavailable() {
    #if targetEnvironment(simulator)
    XCTAssertFalse(SystemBarcodeCameraAccess().hasCamera)
    #endif
  }

  func testSimulatorVoidRequestResolvesOnceWithoutOpeningPermissionOrCameraUI() {
    #if targetEnvironment(simulator)
    let done = expectation(description: "simulator unavailable callback")
    done.assertForOverFulfill = true
    ScannerModule().scanBarcode(nil) {
      XCTAssertTrue(Thread.isMainThread)
      XCTAssertEqual($0["code"] as? String, "unavailable")
      XCTAssertNil($0["cancelled"])
      done.fulfill()
    }
    wait(for: [done], timeout: 2)
    #endif
  }

  func testScannerAndFoodBridgeExportsIncludeRequestAndCallback() throws {
    let exports: [(AnyClass, String, [String: String])] = [
      (ScannerModule.self, "scanBarcode", ScannerModule.methodLookup),
      (ScannerModule.self, "getStatus", ScannerModule.methodLookup),
      (FoodModule.self, "lookupProduct", FoodModule.methodLookup),
    ]
    for (type, key, lookup) in exports {
      let name = try XCTUnwrap(lookup[key])
      let method = try XCTUnwrap(class_getInstanceMethod(type, NSSelectorFromString(name)))
      XCTAssertEqual(method_getNumberOfArguments(method), 4)
    }
  }
}
