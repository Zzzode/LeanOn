import UIKit
import Lynx

/// No network or general filesystem access: only current native photo preview capabilities.
final class PrivatePhotoImageFetcher: NSObject, LynxImageFetcher {
  private let photos: PrivatePhotoStore
  private let worker = DispatchQueue(label: "com.zzzode.leanon.photo-image", qos: .userInitiated)
  private let displayScale: CGFloat
  init(photos: PrivatePhotoStore) { self.photos = photos; self.displayScale = UIScreen.main.scale; super.init() }

  func loadImage(with url: URL, size targetSize: CGSize, contextInfo: [AnyHashable: Any]?,
    completion completionBlock: @escaping LynxImageLoadCompletionBlock) -> (() -> Void) {
    let cancellation = PreviewCancellation()
    let dimension = max(targetSize.width, targetSize.height)
    let pixels = dimension.isFinite && dimension > 0 ? Int(ceil(min(2048, max(1, dimension * displayScale)))) : 256
    worker.async {
      let result = Result { () throws -> UIImage in
        guard !cancellation.isCancelled else { throw NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled) }
        return try self.photos.loadApprovedPreview(url, maximumPixelSize: pixels)
      }
      let delivered = DispatchSemaphore(value: 0)
      DispatchQueue.main.async {
        defer { delivered.signal() }
        guard !cancellation.isCancelled else {
          completionBlock(nil, NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled), url); return
        }
        do {
          let image = try result.get()
          try self.photos.deliverApprovedPreview(url) { completionBlock(image, nil, url) }
        } catch { completionBlock(nil, NSError(domain: "LeanOnPhotoPreview", code: 1), url) }
      }
      // A single decoded image may await the main thread; queued loads cannot accumulate pixel buffers.
      delivered.wait()
    }
    return { cancellation.cancel() }
  }
}

private final class PreviewCancellation {
  private let lock = NSLock()
  private var cancelled = false
  var isCancelled: Bool { lock.lock(); defer { lock.unlock() }; return cancelled }
  func cancel() { lock.lock(); defer { lock.unlock() }; cancelled = true }
}
