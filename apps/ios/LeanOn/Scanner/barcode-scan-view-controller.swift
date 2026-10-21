import AVFoundation
import UIKit

/// Captures packaged-food codes without replacing the underlying Lynx sheet.
final class BarcodeScanViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
  private let session = AVCaptureSession()
  private let captureQueue = DispatchQueue(label: "com.zzzode.leanon.barcode-capture")
  private let completion: (BarcodeScanResult) -> Void
  private var preview: AVCaptureVideoPreviewLayer?
  private var finished = false
  private var observers: [NSObjectProtocol] = []

  init(completion: @escaping (BarcodeScanResult) -> Void) {
    self.completion = completion
    super.init(nibName: nil, bundle: nil)
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    title = ScannerLocale.string("scanner.title")
    navigationItem.leftBarButtonItem = UIBarButtonItem(
      title: ScannerLocale.string("scanner.cancel"), style: .plain,
      target: self, action: #selector(cancel))
    navigationItem.leftBarButtonItem?.accessibilityIdentifier = "scanner.cancel"
    let appearance = ServiceRegistry.shared.appearance.snapshot
    navigationController?.overrideUserInterfaceStyle = appearance.preference.interfaceStyle
    navigationController?.navigationBar.tintColor = appearance.resolved.brand
    let help = UILabel()
    help.text = ScannerLocale.string("scanner.hint")
    help.numberOfLines = 0
    help.textColor = .white
    help.textAlignment = .center
    help.font = .preferredFont(forTextStyle: .body)
    help.adjustsFontForContentSizeCategory = true
    help.backgroundColor = UIColor.black.withAlphaComponent(0.7)
    help.layer.cornerRadius = 12
    help.clipsToBounds = true
    help.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(help)
    NSLayoutConstraint.activate([
      help.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
      help.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
      help.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
      help.heightAnchor.constraint(greaterThanOrEqualToConstant: 64),
    ])
    let layer = AVCaptureVideoPreviewLayer(session: session)
    layer.videoGravity = .resizeAspectFill
    view.layer.insertSublayer(layer, at: 0)
    preview = layer
    for name in [AVCaptureSession.runtimeErrorNotification, AVCaptureSession.wasInterruptedNotification,
                 UIApplication.didEnterBackgroundNotification] {
      observers.append(NotificationCenter.default.addObserver(forName: name, object: name == UIApplication.didEnterBackgroundNotification ? nil : session,
        queue: .main) { [weak self] _ in self?.finish(.unavailable) })
    }
    configureCapture()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    preview?.frame = view.bounds
    if preview?.connection?.isVideoOrientationSupported == true {
      switch view.window?.windowScene?.interfaceOrientation {
      case .landscapeLeft: preview?.connection?.videoOrientation = .landscapeLeft
      case .landscapeRight: preview?.connection?.videoOrientation = .landscapeRight
      case .portraitUpsideDown: preview?.connection?.videoOrientation = .portraitUpsideDown
      default: preview?.connection?.videoOrientation = .portrait
      }
    }
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    if !finished { finish(.cancelled) }
  }

  private func configureCapture() {
    captureQueue.async { [weak self] in
      guard let self else { return }
      do {
        guard let device = AVCaptureDevice.default(for: .video) else { throw CaptureUnavailable() }
        let input = try AVCaptureDeviceInput(device: device)
        let output = AVCaptureMetadataOutput()
        self.session.beginConfiguration()
        defer { self.session.commitConfiguration() }
        guard self.session.canAddInput(input), self.session.canAddOutput(output) else { throw CaptureUnavailable() }
        self.session.addInput(input)
        self.session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        let supported: [AVMetadataObject.ObjectType] = [.ean13, .ean8, .upce, .code128]
        // AVFoundation reports UPC-A as an EAN-13 with a leading zero.
        output.metadataObjectTypes = supported.filter { output.availableMetadataObjectTypes.contains($0) }
        guard !output.metadataObjectTypes.isEmpty else { throw CaptureUnavailable() }
      } catch {
        DispatchQueue.main.async { self.finish(.unavailable) }
        return
      }
      self.session.startRunning()
    }
  }

  func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject],
                      from connection: AVCaptureConnection) {
    guard let barcode = metadataObjects.compactMap({ object -> String? in
      guard let code = object as? AVMetadataMachineReadableCodeObject, let value = code.stringValue else { return nil }
      return Self.normalizedBarcode(value, type: code.type)
    }).first else { return }
    finish(.barcode(barcode))
  }

  static func normalizedBarcode(_ value: String, type: AVMetadataObject.ObjectType) -> String? {
    if type == .upce { return ProductBarcode.expandUPCE(value) }
    return ProductBarcode.normalize(value)
  }

  @objc private func cancel() { finish(.cancelled) }

  private func finish(_ result: BarcodeScanResult) {
    guard !finished else { return }
    finished = true
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    observers.removeAll()
    captureQueue.async { [session] in if session.isRunning { session.stopRunning() } }
    // Deliver after dismissal, so the shared page can open the portion form.
    if let navigation = navigationController, navigation.presentingViewController != nil {
      navigation.dismiss(animated: true) { [completion] in completion(result) }
    } else { completion(result) }
  }

  private struct CaptureUnavailable: Error {}
}
