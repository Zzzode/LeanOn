import Foundation

/// Bluetooth SIG 0x2A9D: flags followed by a little-endian uint16 weight.
/// Optional timestamp/user/BMI fields do not determine the local logging date.
enum WeightMeasurementParser {
  static func parse(_ value: Data) -> Double? {
    let bytes = Array(value)
    guard bytes.count >= 3 else { return nil }
    let raw = UInt16(bytes[1]) | (UInt16(bytes[2]) << 8)
    // 0xFFFF is the SIG unsuccessful-measurement sentinel.
    guard raw != 0xFFFF else { return nil }
    let kg = bytes[0] & 1 == 0
      ? Double(raw) * 0.005
      : Double(raw) * 0.01 * 0.45359237
    guard kg.isFinite, (20...300).contains(kg) else { return nil }
    return (kg * 10).rounded() / 10
  }
}
