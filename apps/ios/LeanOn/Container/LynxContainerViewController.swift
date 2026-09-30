import UIKit
import Lynx

/// Hosts the LynxView and loads the requested route. The shell keeps a single
/// reusable container and drives navigation by route.
final class LynxContainerViewController: UIViewController {

  private let route: String
  private var lynxView: LynxView?
  private let events = GlobalEventDispatcher()
  private let capabilities = CapabilityRegistry()
  private let resources: BundleResourceProvider = DefaultBundleResourceProvider()

  init(route: String) {
    self.route = route
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground

    _ = resources
    // Build the LynxView with the engine config for the pinned Lynx version:
    //  - register a method-auth block gated by capabilities
    //  - install the bundle loader backed by resources
    // Then add it as a subview, events.bind(lynxView), and call
    // lynxView.loadTemplate(fromURL: "\(route).lynx", initData: nil).
  }
}
