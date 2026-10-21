import XCTest
import ImageIO
import UniformTypeIdentifiers
import UIKit
@testable import LeanOn

final class PersonalStoreTests: XCTestCase {
  private func withStores(_ body: (PersonalStore, PrivatePhotoStore) throws -> Void) throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("leanon-personal-" + UUID().uuidString)
    defer { if FileManager.default.fileExists(atPath: dir.path) { try? FileManager.default.removeItem(at: dir) } }
    let keys = try MemoryDataKey()
    let collection = PersonalCollection(file: EncryptedAtomicFile(url: dir.appendingPathComponent("personal.enc"), keys: keys,
      context: "LeanOn personal v1"))
    let photos = PrivatePhotoStore(collection: collection, cacheDirectory: dir.appendingPathComponent("cache"))
    let store = PersonalStore(collection: collection, today: { "2026-10-07" })
    try body(store, photos)
  }
  func testPreferencesCASReplayPreserveAttributesAndRejectDifferingRetry() throws {
    try withStores { store, _ in
      XCTAssertEqual(try store.snapshot()["revision"] as? Int, 0)
      let request: NSDictionary = ["operationId": "pref-1", "expectedRevision": 0, "mutation": ["type": "set-dietary-preferences",
        "preferences": ["pattern": "vegetarian", "excludedFoodIds": ["fixture-food"], "notes": "Synthetic only", "legacyAttribute": ["kept": true]]]]
      let first = try store.mutate(request), bytes = try Data(contentsOf: store.file.url)
      XCTAssertEqual(first["appliedRevision"] as? Int, 1)
      XCTAssertEqual(try store.mutate(request)["replayed"] as? Bool, true)
      XCTAssertEqual(try Data(contentsOf: store.file.url), bytes)
      XCTAssertNotNil((try store.snapshot()["dietaryPreferences"] as? NSDictionary)?["legacyAttribute"])
      let changed = request.mutableCopy() as! NSMutableDictionary; changed["mutation"] = ["type": "delete-measurement", "id": "x"]
      XCTAssertThrowsError(try store.mutate(changed))
      let stale = request.mutableCopy() as! NSMutableDictionary; stale["operationId"] = "pref-2"
      XCTAssertThrowsError(try store.mutate(stale))
      XCTAssertEqual(try Data(contentsOf: store.file.url), bytes)
    }
  }
  func testAccountDeletionCapabilitiesCannotEnterPersonalOrBackupJSON() throws {
    for key in ["pendingAccountDeletion", "deletion-proof", "capability_proof", "deleteCapability"] {
      XCTAssertThrowsError(try PersonalSchema.json(["futurePreferences": [key: "PUBLIC synthetic forbidden value"]]))
    }
  }
  func testMeasurementSaveUpdateDeleteAndValidationAreDurable() throws {
    try withStores { store, _ in
      func save(_ operation: String, _ revision: Int, _ waist: Any) throws -> NSDictionary {
        try store.mutate(["operationId": operation, "expectedRevision": revision,
          "mutation": ["type": "save-measurement", "measurement": ["id": "fixture-m", "date": "2026-10-03", "waistCm": waist]]])
      }
      _ = try save("measure-1", 0, 80)
      _ = try save("measure-2", 1, 81)
      XCTAssertEqual((try store.snapshot()["measurements"] as? [NSDictionary])?.first?["waistCm"] as? Int, 81)
      let before = try Data(contentsOf: store.file.url)
      XCTAssertThrowsError(try save("measure-invalid", 2, true))
      XCTAssertEqual(try Data(contentsOf: store.file.url), before)
      _ = try store.mutate(["operationId": "delete-1", "expectedRevision": 2, "mutation": ["type": "delete-measurement", "id": "fixture-m"]])
      XCTAssertEqual((try store.snapshot()["measurements"] as? NSArray)?.count, 0)
      XCTAssertEqual(try store.snapshot()["revision"] as? Int, 3)
    }
  }
  func testGeneratedPhotoScrubsMetadataEncryptsCacheAndDeletesWithoutPicker() throws {
    try withStores { store, photos in
      let renderer = UIGraphicsImageRenderer(size: CGSize(width: 40, height: 30))
      let image = renderer.image { context in UIColor.systemBlue.setFill(); context.fill(CGRect(x: 0, y: 0, width: 40, height: 30)) }
      let original = NSMutableData()
      let destination = try XCTUnwrap(CGImageDestinationCreateWithData(original, UTType.jpeg.identifier as CFString, 1, nil))
      CGImageDestinationAddImage(destination, try XCTUnwrap(image.cgImage), [kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 1.234,
        kCGImagePropertyGPSLatitudeRef: "N"], kCGImagePropertyExifDictionary: [kCGImagePropertyExifUserComment: "synthetic metadata"]] as CFDictionary)
      XCTAssertTrue(CGImageDestinationFinalize(destination))
      let dimensions = try PrivatePhotoImage.sanitize(original as Data)
      let clean = dimensions.bytes
      let source = try XCTUnwrap(CGImageSourceCreateWithData(clean as CFData, nil))
      let properties = try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? NSDictionary)
      XCTAssertNil(properties[kCGImagePropertyGPSDictionary])
      XCTAssertNil((properties[kCGImagePropertyExifDictionary] as? NSDictionary)?[kCGImagePropertyExifUserComment])
      _ = try store.mutate(["operationId": "photo-1", "expectedRevision": 0, "mutation": ["type": "add-photo", "photo": [
        "id": "fixture-photo", "date": "2026-10-03", "view": "other", "createdAt": "2026-10-07T12:00:00Z",
        "mime": "image/jpeg", "width": dimensions.width, "height": dimensions.height]]], photoBytes: clean)
      XCTAssertEqual(try photos.bytes("fixture-photo"), clean)
      XCTAssertNil(try Data(contentsOf: store.file.url).range(of: clean))
      let cache = try photos.displayURL("fixture-photo"); XCTAssertEqual(try Data(contentsOf: cache), clean)
      let peer = try photos.displayURL("fixture-photo", bytes: clean, scope: "partner")
      XCTAssertNotEqual(peer, cache)
      XCTAssertNotNil(try photos.loadApprovedPreview(cache).cgImage)
      XCTAssertNotNil(try photos.loadApprovedPreview(try XCTUnwrap(URL(string: cache.absoluteString))).cgImage)
      XCTAssertNotNil(try photos.loadApprovedPreview(peer).cgImage)
      XCTAssertThrowsError(try photos.loadApprovedPreview(URL(string: "https://example.com/photo.jpg")!))
      XCTAssertThrowsError(try photos.loadApprovedPreview(store.file.url))
      let forged = photos.cacheDirectory.appendingPathComponent("forged.jpg")
      try clean.write(to: forged)
      XCTAssertThrowsError(try photos.loadApprovedPreview(forged))
      let linked = try photos.displayURL("linked", bytes: clean)
      try FileManager.default.removeItem(at: linked)
      try FileManager.default.createSymbolicLink(at: linked, withDestinationURL: forged)
      XCTAssertThrowsError(try photos.loadApprovedPreview(linked))
      try photos.clearDisplayCache(scope: "partner")
      XCTAssertThrowsError(try photos.deliverApprovedPreview(peer) { XCTFail("Revoked preview delivered") })
      XCTAssertNotNil(try photos.loadApprovedPreview(cache).cgImage)
      XCTAssertEqual(try Data(contentsOf: cache), clean, "A second preview must not invalidate the visible first image")
      _ = try store.mutate(["operationId": "photo-delete", "expectedRevision": 1, "mutation": ["type": "delete-photo", "id": "fixture-photo"]])
      try photos.delete("fixture-photo")
      XCTAssertFalse(photos.exists("fixture-photo")); XCTAssertFalse(FileManager.default.fileExists(atPath: cache.path))
      XCTAssertThrowsError(try photos.bytes("fixture-photo"))
      try photos.clearDisplayCache()
      XCTAssertThrowsError(try photos.loadApprovedPreview(cache))
      XCTAssertFalse(FileManager.default.fileExists(atPath: peer.path))
    }
  }
  func testExistingCorruptEncryptedStateIsPreserved() throws {
    try withStores { store, _ in
      try store.file.write(Data("invalid-json".utf8))
      let before = try Data(contentsOf: store.file.url)
      XCTAssertThrowsError(try store.snapshot())
      XCTAssertEqual(try Data(contentsOf: store.file.url), before)
    }
  }
  func testLynxPreviewFetcherBindsRealSelectorAndCompletesRejectedAndCancelledLoadsOnce() throws {
    try withStores { _, photos in
      let fetcher = PrivatePhotoImageFetcher(photos: photos)
      XCTAssertTrue(fetcher.responds(to: NSSelectorFromString("loadImageWithURL:size:contextInfo:completion:")))
      let rejected = expectation(description: "Unsupported URL reports an honest error")
      rejected.assertForOverFulfill = true
      _ = fetcher.loadImage(with: URL(string: "https://example.com/private.jpg")!, size: .zero, contextInfo: nil) { image, error, _ in
        XCTAssertTrue(Thread.isMainThread); XCTAssertNil(image); XCTAssertNotNil(error); rejected.fulfill()
      }
      let cancelled = expectation(description: "Cancellation resolves once without pixels")
      cancelled.assertForOverFulfill = true
      let cancel = fetcher.loadImage(with: photos.cacheDirectory.appendingPathComponent("unknown.jpg"), size: .zero, contextInfo: nil) { image, error, _ in
        XCTAssertNil(image); XCTAssertEqual((error as NSError?)?.code, NSURLErrorCancelled); cancelled.fulfill()
      }
      cancel()
      wait(for: [rejected, cancelled], timeout: 5)
    }
  }
  func testFailedPreviewCleanupRevokesDecodedCapabilityAndCannotReactivate() throws {
    try withStores { store, _ in
      var notified: [String] = []
      var deletionFails = true
      let directory = store.file.url.deletingLastPathComponent().appendingPathComponent("fault-cache")
      let photos = PrivatePhotoStore(collection: store.collection, cacheDirectory: directory,
        removeCacheItem: { url in
          if deletionFails { throw CocoaError(.fileWriteNoPermission) }
          try FileManager.default.removeItem(at: url)
        }, invalidated: { notified.append($0) })
      let image = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { context in
        UIColor.gray.setFill(); context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
      }
      let bytes = try PrivatePhotoImage.sanitize(try XCTUnwrap(image.jpegData(compressionQuality: 1))).bytes
      let url = try photos.displayURL("fixture", bytes: bytes, scope: "partner")
      XCTAssertNotNil(try photos.loadApprovedPreview(url).cgImage)
      XCTAssertThrowsError(try photos.clearDisplayCache(scope: "partner"))
      XCTAssertEqual(notified, ["partner"])
      XCTAssertThrowsError(try photos.previewToken(scope: "partner"))
      XCTAssertThrowsError(try photos.displayURL("new-after-failure", bytes: bytes, scope: "partner"))
      XCTAssertTrue(FileManager.default.fileExists(atPath: url.path), "Deletion failure remains observable")
      XCTAssertThrowsError(try photos.deliverApprovedPreview(url) { XCTFail("Decoded revoked image delivered") })
      XCTAssertThrowsError(try photos.setPreviewActive(true))
      XCTAssertThrowsError(try photos.previewToken())
      deletionFails = false
      try photos.clearDisplayCache()
      XCTAssertNoThrow(try photos.previewToken(), "Successful foreground retry resumes new previews")
      try photos.setPreviewActive(false)
      try photos.clearDisplayCache()
      XCTAssertThrowsError(try photos.previewToken(), "A cleanup retry cannot reactivate background previews")
    }
  }
}

extension PersonalStoreTests {
  func testIncomingCanonicalPhotoBytesRejectMetadataAndTrailingDataWithoutReencoding() throws {
    let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "public-backup-v1", withExtension: "json"))
    let vector = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? NSDictionary)
    let payload = vector["payload"] as! NSDictionary
    let metadata = ((payload["personal"] as! NSDictionary)["photos"] as! [NSDictionary])[0]
    let bytes = Data(base64Encoded: ((payload["photos"] as! [NSDictionary])[0])["bytesBase64"] as! String)!
    try PrivatePhotoImage.validatePersisted(bytes, metadata: metadata)
    var exif = Data(bytes.prefix(2)); exif.append(contentsOf: [0xff, 0xe1, 0, 8, 69, 120, 105, 102, 0, 0]); exif.append(bytes.dropFirst(2))
    XCTAssertThrowsError(try PrivatePhotoImage.validatePersisted(exif, metadata: metadata))
    var appended = bytes; appended.append(Data("unexpected trailing bytes".utf8))
    XCTAssertThrowsError(try PrivatePhotoImage.validatePersisted(appended, metadata: metadata))
    var comment = Data(bytes.prefix(2)); comment.append(contentsOf: [0xff, 0xfe, 0, 4, 1, 2]); comment.append(bytes.dropFirst(2))
    XCTAssertThrowsError(try PrivatePhotoImage.validatePersisted(comment, metadata: metadata))
    var profile = Data(bytes.prefix(2)); profile.append(contentsOf: [0xff, 0xe2, 0, 4, 1, 2]); profile.append(bytes.dropFirst(2))
    XCTAssertThrowsError(try PrivatePhotoImage.validatePersisted(profile, metadata: metadata))
  }
}

extension PersonalStoreTests {
  func testBackgroundAndRevocationRejectLatePreviewWritesAndRotateURIs() throws {
    try withStores { store, original in
      let url=try XCTUnwrap(Bundle(for:Self.self).url(forResource:"public-backup-v1",withExtension:"json"))
      let payload=(try JSONSerialization.jsonObject(with:Data(contentsOf:url)) as! NSDictionary)["payload"] as! NSDictionary
      let bytes=Data(base64Encoded:((payload["photos"] as! [NSDictionary])[0])["bytesBase64"] as! String)!
      var scopes:[String]=[]
      let photos=PrivatePhotoStore(collection:store.collection,cacheDirectory:original.cacheDirectory){scopes.append($0)}
      let token=try photos.previewToken(), own=try photos.displayURL("same-id",bytes:bytes,expectedGeneration:token)
      let peer=try photos.displayURL("same-id",bytes:bytes,scope:"partner")
      try photos.clearDisplayCache(scope:"partner")
      XCTAssertTrue(FileManager.default.fileExists(atPath:own.path));XCTAssertFalse(FileManager.default.fileExists(atPath:peer.path))
      XCTAssertEqual(scopes,["partner"])
      try photos.setPreviewActive(false)
      XCTAssertThrowsError(try photos.displayURL("same-id",bytes:bytes,expectedGeneration:token))
      XCTAssertFalse(FileManager.default.fileExists(atPath:photos.cacheDirectory.path))
      try photos.setPreviewActive(true)
      XCTAssertThrowsError(try photos.displayURL("same-id",bytes:bytes,expectedGeneration:token))
      let renewed=try photos.displayURL("same-id",bytes:bytes)
      XCTAssertNotEqual(renewed,own,"SDK negative caches cannot reuse the invalidated URI")
      XCTAssertEqual(try Data(contentsOf:renewed),bytes)
      XCTAssertEqual(scopes,["partner","all","all"])
    }
  }
}
