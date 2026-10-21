import Foundation

enum ScaleAvailability { case unknown, ready, denied, unavailable }
enum ScaleState: String { case idle, scanning, connecting, connected }
enum ScaleDriverEvent {
  case availability(ScaleAvailability)
  case discovered(id: String, name: String, rssi: Int)
  case subscribed(id: String)
  case disconnected(id: String)
  case measurement(id: String, value: Data)
  case failed(code: String, message: String)
}

/// Platform boundary. Tests inject a driver which never constructs CoreBluetooth.
protocol ScaleBluetoothDriver: AnyObject {
  var availability: ScaleAvailability { get }
  var canReconnectWithoutPrompt: Bool { get }
  var onEvent: ((ScaleDriverEvent) -> Void)? { get set }
  func start()
  func scan()
  func stopScan()
  func connect(_ id: String)
  func disconnect()
}

/// One process-wide owner keeps pairing and callbacks independent of Lynx routes.
/// All calls and driver events run on the main queue.
final class ScaleManager {
  typealias Reply = (NSDictionary) -> Void
  typealias Schedule = (TimeInterval, @escaping () -> Void) -> (() -> Void)
  private enum Action { case scan, connect(String) }
  private let driver: ScaleBluetoothDriver
  private let readPair: () -> String?
  private let writePair: (String) -> Void
  private let saveWeight: (String, Double) throws -> NSDictionary
  private let today: () -> String
  private let emit: (String, NSDictionary) -> Void
  private let schedule: Schedule
  private var cancelTimeout: (() -> Void)?
  private var waitingAction: Action?
  private var reply: Reply?
  private var activeDevice: String?
  private var discovered = Set<String>()
  private var reconnectAttempted = false
  private(set) var state: ScaleState = .idle

  init(driver: ScaleBluetoothDriver, readPair: @escaping () -> String?,
       writePair: @escaping (String) -> Void,
       saveWeight: @escaping (String, Double) throws -> NSDictionary,
       today: @escaping () -> String,
       emit: @escaping (String, NSDictionary) -> Void,
       schedule: @escaping Schedule = ScaleManager.scheduleOnMain) {
    self.driver = driver; self.readPair = readPair; self.writePair = writePair
    self.saveWeight = saveWeight; self.today = today; self.emit = emit; self.schedule = schedule
    driver.onEvent = { [weak self] event in self?.receive(event) }
  }

  convenience init(driver: ScaleBluetoothDriver, defaults: UserDefaults,
                   recordsStore: RecordsStore,
                   emit: @escaping (String, NSDictionary) -> Void) {
    self.init(driver: driver,
      readPair: { defaults.string(forKey: "leanon.scale.paired-device") },
      writePair: { defaults.set($0, forKey: "leanon.scale.paired-device") },
      saveWeight: { try recordsStore.addWeight(date: $0, weightKg: $1) },
      today: {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
      }, emit: emit)
  }

  func getStatus() -> NSDictionary {
    // Opening the scale sheet can reconnect an already authorized paired scale.
    // A read must never cause the first Bluetooth permission prompt.
    if !reconnectAttempted, state == .idle, driver.canReconnectWithoutPrompt,
       let id = readPair() {
      reconnectAttempted = true
      connect(id) { _ in }
    }
    return ["state": state.rawValue, "pairedDeviceId": readPair() as Any? ?? NSNull()]
  }

  func scan(_ callback: @escaping Reply) {
    guard state != .connecting, state != .scanning else {
      callback(Self.error("unavailable", "A Bluetooth operation is already in progress")); return
    }
    cancelCurrent()
    driver.disconnect()
    activeDevice = nil; discovered.removeAll(); state = .scanning
    begin(.scan, callback)
  }

  func connect(_ deviceId: String, _ callback: @escaping Reply) {
    guard let identifier = UUID(uuidString: deviceId) else {
      callback(Self.error("invalid-request", "Invalid scale identifier")); return
    }
    let id = identifier.uuidString
    guard state != .connecting else {
      callback(Self.error("unavailable", "A Bluetooth operation is already in progress")); return
    }
    if state == .connected, activeDevice == id { callback(["connected": true]); return }
    cancelCurrent(); driver.stopScan(); driver.disconnect()
    activeDevice = id; state = .connecting
    begin(.connect(id), callback)
  }

  func disconnect(_ callback: @escaping Reply) {
    cancelCurrent(); state = .idle; activeDevice = nil
    driver.stopScan(); driver.disconnect()
    // Keep the remembered pair, but explicit disconnect must not auto-reconnect.
    reconnectAttempted = true
    callback(["connected": false])
  }

  private func begin(_ action: Action, _ callback: @escaping Reply) {
    waitingAction = action; reply = callback
    armTimeout(20) { [weak self] in self?.fail("unavailable", "Bluetooth operation timed out") }
    driver.start()
    receive(.availability(driver.availability))
  }

  private func receive(_ event: ScaleDriverEvent) {
    switch event {
    case .availability(.ready):
      guard let action = waitingAction else { return }
      waitingAction = nil
      switch action {
      case .scan:
        driver.scan()
        guard state == .scanning else { return }
        finish(["scanning": true])
        armTimeout(15) { [weak self] in
          guard let self, self.state == .scanning else { return }
          self.driver.stopScan(); self.state = .idle
        }
      case .connect(let id): driver.connect(id)
      }
    case .availability(.denied): fail("not-authorized", "Bluetooth permission denied")
    case .availability(.unavailable): fail("unavailable", "Bluetooth is unavailable or turned off")
    case .availability(.unknown): break
    case .discovered(let id, let name, let rssi):
      guard state == .scanning, discovered.insert(id).inserted else { return }
      emit("scale.discovered", ["deviceId": id, "name": name, "rssi": rssi])
    case .subscribed(let id):
      guard state == .connecting, activeDevice == id else { return }
      cancelTimeout?(); cancelTimeout = nil
      writePair(id); state = .connected; finish(["connected": true])
    case .disconnected(let id):
      guard activeDevice == id else { return }
      fail("unavailable", "Scale disconnected")
    case .measurement(let id, let value):
      guard state == .connected, activeDevice == id,
            let kg = WeightMeasurementParser.parse(value) else { return }
      do {
        let date = today()
        let hostData = try saveWeight(date, kg)
        emit("scale.reading", ["deviceId": id, "date": date, "weightKg": kg])
        emit("records.changed", ["hostData": hostData])
      } catch {
        // No reading or changed event claims a write which failed to persist.
        // Existing pages expose failures through status polling and retry.
        fail("unavailable", "Could not save scale reading")
      }
    case .failed(let code, let message): fail(code, message)
    }
  }

  private func finish(_ result: NSDictionary) {
    let callback = reply; reply = nil; callback?(result)
  }

  private func fail(_ code: String, _ message: String) {
    cancelTimeout?(); cancelTimeout = nil; waitingAction = nil
    state = .idle; activeDevice = nil
    driver.stopScan(); driver.disconnect()
    finish(Self.error(code, message))
  }

  private func cancelCurrent() {
    cancelTimeout?(); cancelTimeout = nil; waitingAction = nil
    finish(Self.error("unavailable", "Bluetooth operation cancelled"))
  }

  private func armTimeout(_ seconds: TimeInterval, _ action: @escaping () -> Void) {
    cancelTimeout?(); cancelTimeout = schedule(seconds, action)
  }

  static func error(_ code: String, _ message: String) -> NSDictionary {
    ["code": code, "message": message]
  }

  static func scheduleOnMain(_ seconds: TimeInterval, _ action: @escaping () -> Void) -> (() -> Void) {
    let item = DispatchWorkItem(block: action)
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: item)
    return { item.cancel() }
  }
}
