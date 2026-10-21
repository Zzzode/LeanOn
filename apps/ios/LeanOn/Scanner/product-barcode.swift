import Foundation

/// GS1 retail check digits; UPC-A and EAN-13 use one persisted identity.
enum ProductBarcode {
  static func normalize(_ input: String) -> String? {
    let code = input.trimmingCharacters(in: .whitespacesAndNewlines)
    let digits = Array(code.utf8)
    guard [8, 12, 13, 14].contains(digits.count),
      digits.allSatisfy({ $0 >= 48 && $0 <= 57 }), digits.contains(where: { $0 != 48 }) else { return nil }
    var sum = 0
    var weight = 3
    for digit in digits.dropLast().reversed() {
      sum += Int(digit - 48) * weight
      weight = weight == 3 ? 1 : 3
    }
    guard (10 - sum % 10) % 10 == Int(digits[digits.count - 1] - 48) else { return nil }
    return digits.count == 12 ? "0" + code : code
  }

  /// Expand according to GS1 General Specifications 5.2.2.4.2 before validating.
  static func expandUPCE(_ input: String) -> String? {
    let digits = Array(input.utf8)
    guard digits.count == 8, digits.allSatisfy({ $0 >= 48 && $0 <= 57 }),
      digits[0] == 48 || digits[0] == 49 else { return nil }
    func text(_ indices: [Int]) -> String { String(decoding: indices.map { digits[$0] }, as: UTF8.self) }
    let expanded: String
    switch digits[6] {
    case 48...50: expanded = text([0, 1, 2, 6]) + "0000" + text([3, 4, 5, 7])
    case 51: expanded = text([0, 1, 2, 3]) + "00000" + text([4, 5, 7])
    case 52: expanded = text([0, 1, 2, 3, 4]) + "00000" + text([5, 7])
    default: expanded = text([0, 1, 2, 3, 4, 5]) + "0000" + text([6, 7])
    }
    return normalize(expanded)
  }
}
