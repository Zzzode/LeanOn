import XCTest
@testable import LeanOn

final class WeightMeasurementParserTests: XCTestCase {
  func testMetricWorkedExamplesAndUnsignedLittleEndian() {
    XCTAssertEqual(WeightMeasurementParser.parse(Data([0, 0xB0, 0x36])), 70)
    XCTAssertEqual(WeightMeasurementParser.parse(Data([0, 0xE4, 0x2F])), 61.3)
  }

  func testPoundsWorkedExamplesAndOptionalFlags() {
    XCTAssertEqual(WeightMeasurementParser.parse(Data([1, 0x10, 0x27])), 45.4)
    XCTAssertEqual(WeightMeasurementParser.parse(Data([1, 0xBC, 0x34])), 61.2)
    XCTAssertEqual(WeightMeasurementParser.parse(Data([0x0E, 0xB0, 0x36, 0, 0, 1])), 70)
  }

  func testMalformedSentinelAndOutOfRangeMeasurementsAreRejected() {
    for payload: [UInt8] in [[], [0], [0, 1], [0, 0, 0], [0, 0xFF, 0xFF], [1, 0xFF, 0xFF], [0, 0xFE, 0xFF]] {
      XCTAssertNil(WeightMeasurementParser.parse(Data(payload)))
    }
    XCTAssertEqual(WeightMeasurementParser.parse(Data([0, 0xA0, 0x0F])), 20)
    XCTAssertEqual(WeightMeasurementParser.parse(Data([0, 0x60, 0xEA])), 300)
  }
}

private final class FakeScaleDriver: ScaleBluetoothDriver {
  var availability: ScaleAvailability = .ready
  var canReconnectWithoutPrompt = false
  var onEvent: ((ScaleDriverEvent) -> Void)?
  var starts = 0
  var scans = 0
  var stopScans = 0
  var connects = [String]()
  var disconnects = 0
  func start() { starts += 1 }
  func scan() { scans += 1 }
  func stopScan() { stopScans += 1 }
  func connect(_ id: String) { connects.append(id) }
  func disconnect() { disconnects += 1 }
}

private final class FakeScaleTimeouts {
  struct Entry { let seconds: TimeInterval; let run: () -> Void; var cancelled = false }
  var entries = [Entry]()
  func schedule(_ seconds: TimeInterval, _ action: @escaping () -> Void) -> (() -> Void) {
    let index = entries.count
    entries.append(Entry(seconds: seconds, run: action))
    return { self.entries[index].cancelled = true }
  }
  func fireLast() {
    guard let last = entries.last, !last.cancelled else { return }
    last.run()
  }
}

final class ScaleManagerTests: XCTestCase {
  private let id = "01234567-89AB-CDEF-0123-456789ABCDEF"
  private var driver: FakeScaleDriver!
  private var timeouts: FakeScaleTimeouts!
  private var manager: ScaleManager!
  private var pair: String?
  private var date = "2026-10-06"
  private var writes = [(String, Double)]()
  private var events = [(String, NSDictionary)]()
  private var failWrite = false

  override func setUp() {
    driver = FakeScaleDriver(); timeouts = FakeScaleTimeouts()
    pair = nil; writes = []; events = []; failWrite = false
    manager = ScaleManager(driver: driver,
      readPair: { self.pair }, writePair: { self.pair = $0 },
      saveWeight: { date, kg in
        if self.failWrite { throw NSError(domain: "fixture-write", code: 1) }
        self.writes.append((date, kg)); return ["weights": [["date": date, "weightKg": kg]]]
      }, today: { self.date }, emit: { self.events.append(($0, $1)) },
      schedule: { self.timeouts.schedule($0, $1) })
  }

  func testStatusNeverStartsBluetoothBeforeAuthorization() {
    pair = id
    XCTAssertEqual(manager.getStatus()["state"] as? String, "idle")
    XCTAssertEqual(driver.starts, 0)
    XCTAssertEqual(driver.connects, [])
  }

  func testScanDeduplicatesAndStopsAfterFifteenSeconds() {
    var result: NSDictionary?
    manager.scan { result = $0 }
    XCTAssertEqual(result?["scanning"] as? Bool, true)
    XCTAssertEqual(driver.scans, 1)
    driver.onEvent?(.discovered(id: id, name: "Test Scale", rssi: -40))
    driver.onEvent?(.discovered(id: id, name: "Test Scale", rssi: -42))
    XCTAssertEqual(events.map { $0.0 }, ["scale.discovered"])
    XCTAssertEqual(timeouts.entries.last?.seconds, 15)
    timeouts.fireLast()
    XCTAssertEqual(manager.state, .idle)
    driver.onEvent?(.discovered(id: id, name: "Late", rssi: -50))
    XCTAssertEqual(events.count, 1)
  }

  func testUnknownPowerWaitsThenStartsAndDeniedCompletesOnce() {
    driver.availability = .unknown
    var results = [NSDictionary]()
    manager.scan { results.append($0) }
    XCTAssertTrue(results.isEmpty)
    XCTAssertEqual(driver.scans, 0)
    driver.availability = .ready
    driver.onEvent?(.availability(.ready))
    XCTAssertEqual(results.count, 1)
    XCTAssertEqual(driver.scans, 1)
    driver.onEvent?(.availability(.ready))
    XCTAssertEqual(driver.scans, 1)
    manager.disconnect { _ in }
    driver.availability = .denied
    manager.scan { results.append($0) }
    XCTAssertEqual(results.last?["code"] as? String, "not-authorized")
    XCTAssertEqual(manager.state, .idle)
  }

  func testPoweredOffAndInvalidIdentifierRejectWithoutPairing() {
    driver.availability = .unavailable
    manager.scan { XCTAssertEqual($0["code"] as? String, "unavailable") }
    manager.connect("not-a-uuid") { XCTAssertEqual($0["code"] as? String, "invalid-request") }
    XCTAssertNil(pair)
    XCTAssertEqual(driver.connects, [])
  }

  func testIdentifierCaseIsNormalizedBeforeConnecting() {
    manager.connect(id.lowercased()) { XCTAssertEqual($0["connected"] as? Bool, true) }
    XCTAssertEqual(driver.connects, [id])
    driver.onEvent?(.subscribed(id: id))
    XCTAssertEqual(manager.state, .connected)
    XCTAssertEqual(pair, id)
  }

  func testConnectionPairsOnlyAfterSubscriptionAndUsesCurrentDateForWrites() {
    var result: NSDictionary?
    manager.connect(id) { result = $0 }
    XCTAssertNil(result)
    XCTAssertNil(pair)
    driver.onEvent?(.measurement(id: id, value: Data([0, 0xB0, 0x36])))
    XCTAssertTrue(writes.isEmpty)
    driver.onEvent?(.subscribed(id: id))
    XCTAssertEqual(result?["connected"] as? Bool, true)
    XCTAssertEqual(pair, id)
    date = "2026-10-07"
    driver.onEvent?(.measurement(id: id, value: Data([0, 0xB0, 0x36])))
    XCTAssertEqual(writes.count, 1)
    XCTAssertEqual(writes.first?.0, "2026-10-07")
    XCTAssertEqual(writes.first?.1, 70)
    XCTAssertEqual(events.map { $0.0 }, ["scale.reading", "records.changed"])
    XCTAssertEqual(events.first?.1["date"] as? String, "2026-10-07")
  }

  func testConnectionTimeoutAndLateSubscriptionDoNotPair() {
    var results = [NSDictionary]()
    manager.connect(id) { results.append($0) }
    timeouts.fireLast()
    XCTAssertEqual(results.count, 1)
    XCTAssertEqual(results.first?["code"] as? String, "unavailable")
    driver.onEvent?(.subscribed(id: id))
    XCTAssertNil(pair)
    XCTAssertEqual(manager.state, .idle)
    XCTAssertEqual(results.count, 1)
  }

  func testDisconnectCancelsPendingConnectAndIgnoresLateReadings() {
    var connectReplies = 0
    manager.connect(id) { XCTAssertEqual($0["code"] as? String, "unavailable"); connectReplies += 1 }
    manager.disconnect { XCTAssertEqual($0["connected"] as? Bool, false) }
    driver.onEvent?(.subscribed(id: id))
    driver.onEvent?(.measurement(id: id, value: Data([0, 0xB0, 0x36])))
    XCTAssertEqual(connectReplies, 1)
    XCTAssertNil(pair)
    XCTAssertTrue(writes.isEmpty)
  }

  func testPersistFailurePublishesNoReadingOrRecordSuccess() {
    manager.connect(id) { _ in }; driver.onEvent?(.subscribed(id: id))
    failWrite = true
    driver.onEvent?(.measurement(id: id, value: Data([0, 0xB0, 0x36])))
    XCTAssertTrue(events.isEmpty)
    XCTAssertEqual(manager.state, .idle)
    XCTAssertEqual(pair, id)
  }

  func testAuthorizedPairReconnectsOnceAndExplicitDisconnectStaysIdle() {
    pair = id; driver.canReconnectWithoutPrompt = true
    XCTAssertEqual(manager.getStatus()["state"] as? String, "connecting")
    _ = manager.getStatus()
    XCTAssertEqual(driver.connects, [id])
    driver.onEvent?(.subscribed(id: id))
    manager.disconnect { _ in }
    XCTAssertEqual(manager.getStatus()["state"] as? String, "idle")
    XCTAssertEqual(driver.connects, [id])
    XCTAssertEqual(pair, id)
  }

  func testPermissionRevocationDropsConnectionButKeepsPair() {
    manager.connect(id) { _ in }; driver.onEvent?(.subscribed(id: id))
    driver.onEvent?(.availability(.denied))
    XCTAssertEqual(manager.state, .idle)
    XCTAssertEqual(pair, id)
    driver.onEvent?(.measurement(id: id, value: Data([0, 0xB0, 0x36])))
    XCTAssertTrue(writes.isEmpty)
  }

  func testUnknownInitializationTimesOutAndUnsupportedServiceRejects() {
    driver.availability = .unknown
    var results = [NSDictionary]()
    manager.scan { results.append($0) }
    timeouts.fireLast()
    XCTAssertEqual(results.count, 1)
    XCTAssertEqual(results.first?["code"] as? String, "unavailable")
    driver.availability = .ready
    manager.connect(id) { results.append($0) }
    driver.onEvent?(.failed(code: "unavailable", message: "Unsupported standard service"))
    XCTAssertEqual(results.count, 2)
    XCTAssertNil(pair)
    XCTAssertEqual(manager.state, .idle)
  }

  func testOtherDeviceAndMalformedMeasurementsNeverWrite() {
    manager.connect(id) { _ in }; driver.onEvent?(.subscribed(id: id))
    driver.onEvent?(.measurement(id: UUID().uuidString, value: Data([0, 0xB0, 0x36])))
    driver.onEvent?(.measurement(id: id, value: Data([0, 0xFF, 0xFF])))
    driver.onEvent?(.measurement(id: id, value: Data([0, 0, 0])))
    XCTAssertTrue(writes.isEmpty)
    XCTAssertTrue(events.isEmpty)
    driver.onEvent?(.disconnected(id: UUID().uuidString))
    XCTAssertEqual(manager.state, .connected)
    driver.onEvent?(.disconnected(id: id))
    XCTAssertEqual(manager.state, .idle)
  }

  func testPairPersistsAcrossManagerRecreationInIsolatedDefaults() throws {
    let suite = "leanon-scale-tests-\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let path = FileManager.default.temporaryDirectory.appendingPathComponent("leanon-scale-\(UUID().uuidString).json")
    let store = RecordsStore(recordsURL: path)
    let firstDriver = FakeScaleDriver()
    let first = ScaleManager(driver: firstDriver, defaults: defaults, recordsStore: store, emit: { _, _ in })
    first.connect(id) { _ in }; firstDriver.onEvent?(.subscribed(id: id))
    let second = ScaleManager(driver: FakeScaleDriver(), defaults: defaults, recordsStore: store, emit: { _, _ in })
    XCTAssertEqual(second.getStatus()["pairedDeviceId"] as? String, id)
    XCTAssertFalse(FileManager.default.fileExists(atPath: path.path))
  }

  func testBridgeExportsVoidMethodsWithRequestAndCallback() {
    let module = ScaleModule(manager: manager)
    XCTAssertTrue(module.responds(to: NSSelectorFromString("scan:callback:")))
    XCTAssertTrue(module.responds(to: NSSelectorFromString("disconnect:callback:")))
    XCTAssertTrue(module.responds(to: NSSelectorFromString("getStatus:callback:")))
    module.getStatus(nil) { XCTAssertEqual($0["state"] as? String, "idle") }
    module.connect(["deviceId": 123]) { XCTAssertEqual($0["code"] as? String, "invalid-request") }
  }
}
