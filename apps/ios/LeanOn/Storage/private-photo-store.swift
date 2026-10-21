import Foundation
import UIKit
import ImageIO
import UniformTypeIdentifiers
import CryptoKit

/// Re-encodes a bounded image derivative. Original EXIF, GPS, filenames and asset IDs never persist.
enum PrivatePhotoImage {
  static let maximumInputBytes = 20 * 1024 * 1024
  static func validatePersisted(_ bytes: Data, metadata: NSDictionary) throws {
    try validateJPEGMarkers(bytes)
    guard !bytes.isEmpty, bytes.count <= maximumInputBytes, metadata["mime"] as? String == "image/jpeg",
      let source = CGImageSourceCreateWithData(bytes as CFData, nil), CGImageSourceGetCount(source) == 1,
      CGImageSourceGetType(source) as String? == UTType.jpeg.identifier,
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? NSDictionary,
      properties[kCGImagePropertyPixelWidth] as? Int == metadata["width"] as? Int,
      properties[kCGImagePropertyPixelHeight] as? Int == metadata["height"] as? Int,
      properties[kCGImagePropertyGPSDictionary] == nil, properties[kCGImagePropertyExifDictionary] == nil,
      properties[kCGImagePropertyIPTCDictionary] == nil, properties[kCGImagePropertyTIFFDictionary] == nil,
      CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceThumbnailMaxPixelSize: 2048, kCGImageSourceShouldCacheImmediately: true] as CFDictionary) != nil,
      CGImageSourceGetStatus(source) == .statusComplete
    else { throw RecordTransactionError.invalidRequest("stored photo bytes") }
  }
  private static func validateJPEGMarkers(_ bytes: Data) throws {
    let b = [UInt8](bytes)
    guard b.count >= 4, b[0] == 0xff, b[1] == 0xd8 else { throw NativeCryptoError.invalidEnvelope }
    var i = 2
    while i < b.count {
      guard b[i] == 0xff else { throw NativeCryptoError.invalidEnvelope }
      while i < b.count && b[i] == 0xff { i += 1 }
      guard i < b.count else { throw NativeCryptoError.invalidEnvelope }
      let marker = b[i]; i += 1
      if marker == 0xd9 { guard i == b.count else { throw NativeCryptoError.invalidEnvelope }; return }
      guard !(0xe1...0xef).contains(marker), ![0xfe, 0xd8, 0x00].contains(marker), i + 1 < b.count else { throw NativeCryptoError.invalidEnvelope }
      let length = Int(b[i]) * 256 + Int(b[i + 1])
      guard length >= 2, i + length <= b.count else { throw NativeCryptoError.invalidEnvelope }
      if marker == 0xe0 {
        guard length == 16, Array(b[(i + 2)..<(i + 7)]) == Array("JFIF\u{0}".utf8),
          b[i + 14] == 0, b[i + 15] == 0 else { throw NativeCryptoError.invalidEnvelope }
      }
      i += length
      if marker == 0xda {
        while i < b.count {
          if b[i] != 0xff { i += 1; continue }
          guard i + 1 < b.count else { throw NativeCryptoError.invalidEnvelope }
          let next = b[i + 1]
          if next == 0x00 || (0xd0...0xd7).contains(next) { i += 2; continue }
          break
        }
      }
    }
    throw NativeCryptoError.invalidEnvelope
  }
  static func sanitize(_ input: Data) throws -> (bytes: Data, width: Int, height: Int) {
    guard input.count <= maximumInputBytes,
      let source = CGImageSourceCreateWithData(input as CFData, nil), CGImageSourceGetCount(source) == 1,
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = properties[kCGImagePropertyPixelWidth] as? Int,
      let height = properties[kCGImagePropertyPixelHeight] as? Int,
      (1...16384).contains(width), (1...16384).contains(height), width * height <= 80_000_000,
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: 2048, kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
    else { throw RecordTransactionError.invalidRequest("photo image") }
    guard let color = CGColorSpace(name: CGColorSpace.sRGB),
      let context = CGContext(data: nil, width: image.width, height: image.height, bitsPerComponent: 8,
        bytesPerRow: image.width * 4, space: color, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue),
      (1...2048).contains(image.width), (1...2048).contains(image.height) else { throw NativeCryptoError.invalidEnvelope }
    context.setFillColor(CGColor(gray: 1, alpha: 1)); context.fill(CGRect(x: 0, y: 0, width: image.width, height: image.height))
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    guard let normalized = context.makeImage() else { throw NativeCryptoError.invalidEnvelope }
    let output = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil) else {
      throw RecordTransactionError.invalidRequest("photo encoder")
    }
    CGImageDestinationAddImage(destination, normalized, [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
    guard CGImageDestinationFinalize(destination) else { throw RecordTransactionError.invalidRequest("photo encoder") }
    let bytes = try scrubEncoderHeaders(output as Data)
    return (bytes, image.width, image.height)
  }
  private static func scrubEncoderHeaders(_ bytes: Data) throws -> Data {
    let b = [UInt8](bytes)
    guard b.count >= 4, b[0] == 0xff, b[1] == 0xd8 else { throw NativeCryptoError.invalidEnvelope }
    var result = Data(b.prefix(2)), i = 2
    while i + 3 < b.count {
      let start = i
      guard b[i] == 0xff else { throw NativeCryptoError.invalidEnvelope }
      let marker = b[i + 1]
      let length = Int(b[i + 2]) * 256 + Int(b[i + 3])
      guard length >= 2, i + 2 + length <= b.count else { throw NativeCryptoError.invalidEnvelope }
      i += 2 + length
      if !(0xe1...0xef).contains(marker), marker != 0xfe { result.append(contentsOf: b[start..<i]) }
      if marker == 0xda {
        result.append(contentsOf: b[i...]); try validateJPEGMarkers(result); return result
      }
    }
    throw NativeCryptoError.invalidEnvelope
  }
}

final class PrivatePhotoStore {
  let collection: PersonalCollection
  let cacheDirectory: URL
  private let cacheLock = NSRecursiveLock()
  private var active = true
  private var desiredActive = true
  private var generations = ["own":UUID().uuidString,"partner":UUID().uuidString]
  private var approvedPreviews: [String: (scope: String, digest: Data)] = [:]
  private let invalidated: (String)->Void
  private let removeCacheItem: (URL) throws -> Void
  init(collection: PersonalCollection, cacheDirectory: URL,
    removeCacheItem: @escaping (URL) throws -> Void = { try FileManager.default.removeItem(at: $0) },
    invalidated: @escaping (String)->Void = { _ in }) {
    self.collection = collection; self.cacheDirectory = cacheDirectory; self.invalidated = invalidated
    self.removeCacheItem = removeCacheItem
  }
  func previewToken(scope: String = "own") throws -> String {
    cacheLock.lock();defer{cacheLock.unlock()}
    guard active,let token=generations[scope] else {throw RecordTransactionError.notAuthorized}
    return token
  }
  func setPreviewActive(_ value: Bool) throws {
    cacheLock.lock();defer{cacheLock.unlock()}
    desiredActive = value
    active = false
    try clearDisplayCache()
    active = value
  }
  func exists(_ id: String) -> Bool {
    (try? bytes(id)) != nil
  }
  func bytes(_ id: String) throws -> Data {
    collection.lock.lock(); defer { collection.lock.unlock() }
    let root = try collection.load()
    guard let encoded = (root["photoBytes"] as? NSDictionary)?[try PersonalSchema.id(id)] as? String,
      let bytes = Data(base64Encoded: encoded) else { throw RecordTransactionError.notFound }
    return bytes
  }
  private func cacheName(_ id: String, scope: String = "own") throws -> String {
    let id = try PersonalSchema.id(id)
    return scope + "-" + generations[scope]! + "-" + SHA256.hash(data: Data(id.utf8)).map { String(format: "%02x", $0) }.joined() + ".jpg"
  }
  func displayURL(_ id: String) throws -> URL {
    let token = try previewToken()
    let data = try bytes(id)
    return try displayURL(id, bytes: data, expectedGeneration: token)
  }
  func displayURL(_ id: String, bytes data: Data, scope: String = "own", expectedGeneration: String? = nil) throws -> URL {
    cacheLock.lock();defer{cacheLock.unlock()}
    guard active, let current=generations[scope], expectedGeneration == nil || expectedGeneration == current else {
      throw RecordTransactionError.notAuthorized
    }
    guard data.count <= PrivatePhotoImage.maximumInputBytes else { throw NativeCryptoError.invalidEnvelope }
    try FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    let url = cacheDirectory.appendingPathComponent(try cacheName(id, scope: scope))
    var entries = try FileManager.default.contentsOfDirectory(at: cacheDirectory, includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey])
      .filter { $0 != url }.map { file -> (URL, Int, Date) in
        let values = try file.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
        return (file, values.fileSize ?? 0, values.contentModificationDate ?? .distantPast)
      }.sorted { $0.2 < $1.2 }
    var total = entries.reduce(data.count) { $0 + $1.1 }
    while total > 64 * 1024 * 1024 || entries.count >= 2000 {
      guard !entries.isEmpty else { throw NativeCryptoError.invalidEnvelope }
      let oldest = entries.removeFirst(); try FileManager.default.removeItem(at: oldest.0); total -= oldest.1
      approvedPreviews.removeValue(forKey: oldest.0.lastPathComponent)
    }
    try data.write(to: url, options: [.atomic, .completeFileProtection])
    approvedPreviews[url.lastPathComponent] = (scope, Data(SHA256.hash(data: data)))
    var cache = cacheDirectory, values = URLResourceValues(); values.isExcludedFromBackup = true
    try cache.setResourceValues(values)
    return url
  }
  func delete(_ id: String) throws {
    cacheLock.lock();defer{cacheLock.unlock()}
    let cache = cacheDirectory.appendingPathComponent(try cacheName(id))
    if FileManager.default.fileExists(atPath: cache.path) { try FileManager.default.removeItem(at: cache) }
    approvedPreviews.removeValue(forKey: cache.lastPathComponent)
  }
  private func requireApprovedPreview(_ url: URL) throws {
    try NativeStoreRecoveryGate.require(collection.file.url)
    let normalized = url.standardizedFileURL
    guard active, url.isFileURL, url.host == nil || url.host == "" || url.host == "localhost",
      url.query == nil, url.fragment == nil, url.user == nil,
      normalized == url, normalized.deletingLastPathComponent().path == cacheDirectory.standardizedFileURL.path,
      normalized.resolvingSymlinksInPath() == cacheDirectory.resolvingSymlinksInPath().appendingPathComponent(normalized.lastPathComponent),
      try normalized.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink == false,
      let approval = approvedPreviews[normalized.lastPathComponent], let generation = generations[approval.scope],
      normalized.lastPathComponent.hasPrefix(approval.scope + "-" + generation + "-")
    else { throw RecordTransactionError.notAuthorized }
  }
  /// Only capabilities issued by this instance can reach the Lynx image decoder.
  func loadApprovedPreview(_ url: URL, maximumPixelSize: Int = 2048) throws -> UIImage {
    cacheLock.lock(); defer { cacheLock.unlock() }
    try requireApprovedPreview(url)
    let bytes = try ProtectedAtomicBytes.read(url, maximumBytes: PrivatePhotoImage.maximumInputBytes)
    guard Data(SHA256.hash(data: bytes)) == approvedPreviews[url.lastPathComponent]?.digest,
      (1...2048).contains(maximumPixelSize), let source = CGImageSourceCreateWithData(bytes as CFData, nil),
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: maximumPixelSize,
        kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
    else { throw NativeCryptoError.invalidEnvelope }
    return UIImage(cgImage: image)
  }
  /// Hold the same generation lock through delivery so a background/revoke clear cannot race it.
  func deliverApprovedPreview(_ url: URL, _ deliver: () -> Void) throws {
    cacheLock.lock(); defer { cacheLock.unlock() }
    try requireApprovedPreview(url)
    deliver()
  }
  func clearDisplayCache(scope: String = "all") throws {
    cacheLock.lock();defer{cacheLock.unlock()}
    guard ["own","partner","all"].contains(scope) else {throw RecordTransactionError.invalidRequest("preview scope")}
    // Revoke capabilities before fallible filesystem cleanup, including already decoded requests.
    for key in ["own","partner"] where scope == "all" || scope == key {generations[key]=UUID().uuidString}
    approvedPreviews = approvedPreviews.filter { scope != "all" && $0.value.scope != scope }
    invalidated(scope)
    do {
      if FileManager.default.fileExists(atPath: cacheDirectory.path) {
        if scope == "all" {try removeCacheItem(cacheDirectory)}
        else {
          for file in try FileManager.default.contentsOfDirectory(at:cacheDirectory,includingPropertiesForKeys:nil) where file.lastPathComponent.hasPrefix(scope+"-") {
            try removeCacheItem(file)
          }
        }
      }
    } catch { active = false; throw error }
    // A successful retry restores only the current lifecycle intent, never a backgrounded cache.
    active = desiredActive
  }
  static func validateCollection(_ root: NSDictionary) throws {
    guard let state = root["personal"] as? NSDictionary, let photos = state["photos"] as? [NSDictionary],
      let blobs = root["photoBytes"] as? NSDictionary, blobs.count == photos.count, photos.count <= 1000 else {
      throw RecordTransactionError.invalidRequest("photo collection")
    }
    var total = 0
    for metadata in photos {
      let id = try PersonalSchema.id(metadata["id"])
      guard let encoded = blobs[id] as? String, let bytes = Data(base64Encoded: encoded),
        bytes.base64EncodedString() == encoded else { throw RecordTransactionError.invalidRequest("photo bytes") }
      total += bytes.count
      guard total <= 32 * 1024 * 1024 else { throw RecordTransactionError.invalidRequest("total photo size") }
      try PrivatePhotoImage.validatePersisted(bytes, metadata: metadata)
    }
  }
}
