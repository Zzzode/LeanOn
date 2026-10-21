import UIKit
import Lynx

/// Hosts one LynxView rendering a single screen of the shared bundle. The
/// bundle URL is fixed (main.lynx); the screen to render is passed through
/// initData.route. Root tab screens hide the navigation bar and let pages
/// draw their own header; pushed secondary screens show the navigation bar
/// with the system back control.
final class LynxContainerViewController: UIViewController {

  private let screenRoute: String
  private let bundle: String
  private let isRootTab: Bool
  private let lifecycleLogger = LifecycleLogger()
  private var lynxView: LynxView?
  private var photoImageFetcher: PrivatePhotoImageFetcher?
  private var bottomConstraint: NSLayoutConstraint?
  private var keyboardOcclusion: CGFloat = 0
  private(set) var appliedFontScale: CGFloat = 1

  init(
    screenRoute: String,
    bundle: String = "main.lynx",
    isRootTab: Bool = true
  ) {
    self.screenRoute = screenRoute
    self.bundle = bundle
    self.isRootTab = isRootTab
    super.init(nibName: nil, bundle: nil)
    if !isRootTab {
      applySecondaryTitle()
    }
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    applyAppearance(ServiceRegistry.shared.appearance.snapshot)
    NotificationCenter.default.addObserver(self, selector: #selector(updateFontScale), name: UIContentSizeCategory.didChangeNotification, object: nil)
    NotificationCenter.default.addObserver(self, selector: #selector(updateFontScale), name: UIApplication.willEnterForegroundNotification, object: nil)
    NotificationCenter.default.addObserver(self, selector: #selector(keyboardChanged(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    navigationController?.setNavigationBarHidden(isRootTab, animated: animated)
  }

  /// Size available to the LynxView after applying the safe-area insets.
  /// Root page text stops at the native safe area so the floating tab bar's
  /// edge wash cannot lower text contrast. The host canvas continues behind it.
  private func contentSize(for view: UIView) -> CGSize {
    let bounds = view.bounds.size
    let inset = view.safeAreaInsets
    return CGSize(
      width: bounds.width,
      height: max(0, bounds.height - inset.top - max(keyboardOcclusion, isRootTab ? inset.bottom : 0)),
    )
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    bottomConstraint?.constant = -max(keyboardOcclusion, isRootTab ? view.safeAreaInsets.bottom : 0)
    let size = contentSize(for: view)
    #if DEBUG
    NSLog("[LeanOnLayout] route=\(screenRoute) size=\(size) existing=\(lynxView != nil)")
    #endif

    if let lynxView = lynxView {
      if lynxView.preferredLayoutWidth != size.width
        || lynxView.preferredLayoutHeight != size.height {
        lynxView.updateViewport(withPreferredLayoutWidth: size.width, preferredLayoutHeight: size.height, needLayout: true)
      }
      return
    }

    let lynxView = LynxView { builder in
      builder.config = LynxEnv.sharedInstance().config
      builder.screenSize = size
      builder.fontScale = UIFontMetrics.default.scaledValue(for: 16, compatibleWith: self.traitCollection) / 16
    }
    lynxView.translatesAutoresizingMaskIntoConstraints = false
    lynxView.preferredLayoutWidth = size.width
    lynxView.preferredLayoutHeight = size.height
    lynxView.layoutWidthMode = .exact
    lynxView.layoutHeightMode = .exact
    lynxView.addLifecycleClient(lifecycleLogger)
    let photoImageFetcher = PrivatePhotoImageFetcher(photos: ServiceRegistry.shared.photos)
    self.photoImageFetcher = photoImageFetcher
    lynxView.imageFetcher = photoImageFetcher

    view.addSubview(lynxView)
    let guide = view.safeAreaLayoutGuide
    let bottom = lynxView.bottomAnchor.constraint(equalTo: view.bottomAnchor,
      constant: -max(keyboardOcclusion, isRootTab ? view.safeAreaInsets.bottom : 0))
    bottomConstraint = bottom
    NSLayoutConstraint.activate([
      lynxView.topAnchor.constraint(equalTo: guide.topAnchor),
      lynxView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      lynxView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      // Keep the approved tab chrome on the same host canvas, with text above it.
      bottom,
    ])
    self.lynxView = lynxView
    applyAppearance(ServiceRegistry.shared.appearance.snapshot)

    // Native -> JS events fan out to every mounted LynxView.
    ServiceRegistry.shared.events.bind(lynxView)

    let initData = LynxTemplateData(dictionary: bootstrapData())
    lynxView.loadTemplate(fromURL: bundle, initData: initData)
  }

  @objc private func updateFontScale() {
    #if DEBUG
    if Bundle.main.bundleIdentifier == "com.zzzode.leanon.uiqa",
      let path = ProcessInfo.processInfo.environment["LEANON_QA_CONTENT_SIZE_CATEGORY_PATH"], path.hasPrefix("/tmp/leanon-"),
      let data = try? ProtectedAtomicBytes.read(URL(fileURLWithPath: path), maximumBytes: 4096),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: String], let raw = object["category"],
      [UIContentSizeCategory.large.rawValue, UIContentSizeCategory.accessibilityExtraExtraExtraLarge.rawValue].contains(raw),
      #available(iOS 17.0, *) {
      traitOverrides.preferredContentSizeCategory = UIContentSizeCategory(rawValue: raw)
    }
    #endif
    appliedFontScale = UIFontMetrics.default.scaledValue(for: 16, compatibleWith: self.traitCollection) / 16
    lynxView?.updateFontScale(appliedFontScale)
  }

  @objc private func keyboardChanged(_ notification: Notification) {
    guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
    let local = view.convert(frame, from: nil)
    keyboardOcclusion = max(0, view.bounds.maxY - local.minY)
    bottomConstraint?.constant = -max(keyboardOcclusion, isRootTab ? view.safeAreaInsets.bottom : 0)
    view.setNeedsLayout()
    view.layoutIfNeeded()
  }

  deinit { NotificationCenter.default.removeObserver(self) }

  override var preferredStatusBarStyle: UIStatusBarStyle {
    ServiceRegistry.shared.appearance.snapshot.resolved == .dark ? .lightContent : .darkContent
  }

  /// Settings renders its heading in the shared page; keep only native Back.
  func applySecondaryTitle() {
    guard !isRootTab else { return }
    title = screenRoute == "settings" ? "" : screenRoute
  }

  func applyAppearance(_ appearance: AppAppearanceSnapshot) {
    guard isViewLoaded else { return }
    view.backgroundColor = appearance.resolved.canvas
    lynxView?.backgroundColor = appearance.resolved.canvas
    // System keyboards already react to window traits; forcing a reload during
    // the same trait transition can interrupt an active input session.
    let keyboardStyle: UIKeyboardAppearance = appearance.preference == .system
      ? .default : (appearance.resolved == .dark ? .dark : .light)
    updateKeyboardAppearance(in: view, style: keyboardStyle)
    setNeedsStatusBarAppearanceUpdate()
  }

  private func updateKeyboardAppearance(in view: UIView, style: UIKeyboardAppearance) {
    if let input = view as? UITextField, input.keyboardAppearance != style {
      input.keyboardAppearance = style
      if input.isFirstResponder { input.reloadInputViews() }
    }
    if let input = view as? UITextView, input.keyboardAppearance != style {
      input.keyboardAppearance = style
      if input.isFirstResponder { input.reloadInputViews() }
    }
    for child in view.subviews { updateKeyboardAppearance(in: child, style: style) }
  }

  /// Bootstrap shape consumed by useInitData() in pages: { hostData, route, locale }.
  private func bootstrapData() -> [String: Any] {
    [
      "hostData": (try? ServiceRegistry.shared.recordsStore.currentSnapshot()) ?? NSDictionary(),
      "route": screenRoute,
      "platform": "ios",
      "supportedMethods": CapabilityRegistry().supportedMethods,
      "appearancePreference": ServiceRegistry.shared.appearance.snapshot.preference.rawValue,
      "appearance": ServiceRegistry.shared.appearance.snapshot.resolved.rawValue,
      // Pages resolve this tag through resolveLocale(); pass the raw system
      // language so zh-Hans-* lands on zh-CN. The env var is a UI-test hook,
      // e.g. SIMCTL_CHILD_LEANON_LOCALE=zh-CN.
      "locale":
        ProcessInfo.processInfo.environment["LEANON_LOCALE"]
        ?? AppLocale.defaults.string(forKey: "leanon.locale")
        ?? Locale.preferredLanguages.first ?? "en",
    ]
  }
}
