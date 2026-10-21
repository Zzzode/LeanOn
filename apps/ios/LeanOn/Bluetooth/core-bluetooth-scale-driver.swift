import CoreBluetooth
import Foundation

/// Thin CoreBluetooth adapter. The central is created only after an explicit
/// operation or an already-authorized reconnect, never during app bootstrap.
final class CoreBluetoothScaleDriver: NSObject, ScaleBluetoothDriver,
                                      CBCentralManagerDelegate, CBPeripheralDelegate {
  static let weightService = CBUUID(string: "181D")
  static let weightMeasurement = CBUUID(string: "2A9D")
  var onEvent: ((ScaleDriverEvent) -> Void)?
  private var central: CBCentralManager?
  private var peripheral: CBPeripheral?
  private var found = [UUID: CBPeripheral]()

  var availability: ScaleAvailability {
    if CBManager.authorization == .denied || CBManager.authorization == .restricted { return .denied }
    guard let central else { return .unknown }
    switch central.state {
    case .poweredOn: return .ready
    case .unauthorized: return .denied
    case .poweredOff, .unsupported, .resetting: return .unavailable
    case .unknown: return .unknown
    @unknown default: return .unavailable
    }
  }

  var canReconnectWithoutPrompt: Bool {
    CBManager.authorization == .allowedAlways && availability != .unavailable
  }

  func start() {
    if central == nil, availability != .denied {
      central = CBCentralManager(delegate: self, queue: .main,
        options: [CBCentralManagerOptionShowPowerAlertKey: false])
    }
  }

  func scan() {
    guard availability == .ready else { onEvent?(.availability(availability)); return }
    found.removeAll()
    central?.scanForPeripherals(withServices: [Self.weightService],
      options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
  }

  func stopScan() { central?.stopScan() }

  func connect(_ id: String) {
    guard let identifier = UUID(uuidString: id), let central,
          let remote = found[identifier]
            ?? central.retrievePeripherals(withIdentifiers: [identifier]).first else {
      onEvent?(.failed(code: "unavailable", message: "Scale is not available; scan again")); return
    }
    peripheral = remote; remote.delegate = self
    central.connect(remote, options: nil)
  }

  func disconnect() {
    guard let remote = peripheral else { return }
    peripheral = nil; remote.delegate = nil
    central?.cancelPeripheralConnection(remote)
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    onEvent?(.availability(availability))
  }

  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                      advertisementData: [String: Any], rssi RSSI: NSNumber) {
    found[peripheral.identifier] = peripheral
    let name = peripheral.name ?? advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? "Scale"
    onEvent?(.discovered(id: peripheral.identifier.uuidString, name: name, rssi: RSSI.intValue))
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    guard peripheral === self.peripheral else { return }
    peripheral.discoverServices([Self.weightService])
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral,
                      error: Error?) {
    guard peripheral === self.peripheral else { return }
    self.peripheral = nil; peripheral.delegate = nil
    onEvent?(.failed(code: "unavailable", message: "Scale connection failed"))
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral,
                      error: Error?) {
    guard peripheral === self.peripheral else { return }
    self.peripheral = nil; peripheral.delegate = nil
    onEvent?(.disconnected(id: peripheral.identifier.uuidString))
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard peripheral === self.peripheral else { return }
    guard error == nil,
          let service = peripheral.services?.first(where: { $0.uuid == Self.weightService }) else {
      onEvent?(.failed(code: "unavailable", message: "Scale has no standard Weight Scale service")); return
    }
    peripheral.discoverCharacteristics([Self.weightMeasurement], for: service)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService,
                  error: Error?) {
    guard peripheral === self.peripheral else { return }
    guard error == nil,
          let measurement = service.characteristics?.first(where: { $0.uuid == Self.weightMeasurement }),
          measurement.properties.contains(.indicate) else {
      onEvent?(.failed(code: "unavailable", message: "Scale has no standard Weight Measurement indication")); return
    }
    // CoreBluetooth writes the CCC descriptor for standard indications.
    peripheral.setNotifyValue(true, for: measurement)
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic,
                  error: Error?) {
    guard peripheral === self.peripheral, characteristic.uuid == Self.weightMeasurement else { return }
    guard error == nil, characteristic.isNotifying else {
      onEvent?(.failed(code: "unavailable", message: "Could not enable scale indications")); return
    }
    onEvent?(.subscribed(id: peripheral.identifier.uuidString))
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic,
                  error: Error?) {
    guard peripheral === self.peripheral, characteristic.uuid == Self.weightMeasurement else { return }
    guard error == nil, let value = characteristic.value else {
      onEvent?(.failed(code: "unavailable", message: "Could not read scale measurement")); return
    }
    onEvent?(.measurement(id: peripheral.identifier.uuidString, value: value))
  }
}
