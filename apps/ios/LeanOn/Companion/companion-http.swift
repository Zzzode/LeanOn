import Foundation

protocol CompanionHTTPTransport {
  func request(endpoint: URL, method: String, path: String, body: [String: Any]?, token: String?) throws -> [String: Any]
  func binary(endpoint: URL, method: String, path: String, bytes: Data?, token: String) throws -> Data
}
extension CompanionHTTPTransport {
  func binary(endpoint: URL, method: String, path: String, bytes: Data?, token: String) throws -> Data { throw CompanionError.http("binary-transport-unavailable", true) }
}

/// Runs on the module's serial I/O queue. Response streaming is bounded before append;
/// redirects cannot forward a password, device proof or bearer token to another endpoint.
final class CompanionHTTP: CompanionHTTPTransport {
  private let maximumResponseBytes: Int
  init(maximumResponseBytes: Int = 96 * 1024 * 1024) { self.maximumResponseBytes = maximumResponseBytes }
  func request(endpoint: URL, method: String, path: String, body: [String: Any]?, token: String?) throws -> [String: Any] {
    guard (path.hasPrefix("/v1/") || path.hasPrefix("/v2/")), let url = URL(string: endpoint.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path) else { throw CompanionError.invalidRequest }
    var request = URLRequest(url: url, timeoutInterval: 30)
    request.httpMethod = method; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
    if let body {
      let encoded = try CompanionCrypto.json(body)
      guard encoded.count <= 96 * 1024 * 1024 else { throw CompanionError.capacity }
      request.httpBody = encoded
    }
    let receiver = BoundedReceiver(maximumBytes: maximumResponseBytes)
    let configuration = URLSessionConfiguration.ephemeral
    configuration.urlCache = nil; configuration.httpCookieStorage = nil; configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    let session = URLSession(configuration: configuration, delegate: receiver, delegateQueue: nil)
    defer { session.finishTasksAndInvalidate() }
    let task = session.dataTask(with: request); task.resume()
    guard receiver.done.wait(timeout: .now() + 35) == .success else { task.cancel(); throw CompanionError.http("offline", true) }
    let result = receiver.read()
    if let error = result.error as? CompanionError { throw error }
    guard result.error == nil, let metadata = result.metadata else { throw CompanionError.http("offline", true) }
    guard let value = try JSONSerialization.jsonObject(with: result.data) as? [String: Any] else { throw CompanionError.invalidResponse }
    guard (200..<300).contains(metadata.statusCode) else {
      let supplied = (value["error"] as? [String: Any])?["code"] as? String
      let code = supplied.flatMap { CompanionCrypto.validId($0) ? $0 : nil } ?? "request-failed"
      throw CompanionError.http(code, metadata.statusCode >= 500 || metadata.statusCode == 429)
    }
    return value
  }
  func binary(endpoint: URL, method: String, path: String, bytes: Data?, token: String) throws -> Data {
    let maximum = 20 * 1024 * 1024 + 28
    guard path.hasPrefix("/v2/groups/"), ["GET", "PUT"].contains(method), (bytes?.count ?? 0) <= maximum,
      let url = URL(string: endpoint.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + path) else { throw CompanionError.invalidRequest }
    var request = URLRequest(url: url, timeoutInterval: 30); request.httpMethod = method; request.httpBody = bytes
    request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization"); request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
    if let bytes { request.setValue(String(bytes.count), forHTTPHeaderField: "Content-Length") }
    let receiver = BoundedReceiver(maximumBytes: maximum), configuration = URLSessionConfiguration.ephemeral
    configuration.urlCache = nil; configuration.httpCookieStorage = nil; configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    let session = URLSession(configuration: configuration, delegate: receiver, delegateQueue: nil); defer { session.finishTasksAndInvalidate() }
    let task = session.dataTask(with: request); task.resume()
    guard receiver.done.wait(timeout: .now() + 35) == .success else { task.cancel(); throw CompanionError.http("offline", true) }
    let result = receiver.read(); if let error = result.error { throw error }
    guard let metadata = result.metadata else { throw CompanionError.invalidResponse }
    guard (200..<300).contains(metadata.statusCode) else { throw CompanionError.http("private-photo-request-failed", metadata.statusCode >= 500 || metadata.statusCode == 429) }
    return result.data
  }
  private final class BoundedReceiver: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    let done = DispatchSemaphore(value: 0)
    private let lock = NSLock()
    private let maximumBytes: Int
    private var data = Data(), metadata: HTTPURLResponse?, error: Error?
    init(maximumBytes: Int) { self.maximumBytes = maximumBytes }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
      completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
      lock.lock()
      guard let http = response as? HTTPURLResponse else { error = CompanionError.invalidResponse; lock.unlock(); completionHandler(.cancel); return }
      if response.expectedContentLength > Int64(maximumBytes) { error = CompanionError.capacity; lock.unlock(); completionHandler(.cancel); return }
      metadata = http; lock.unlock(); completionHandler(.allow)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive chunk: Data) {
      lock.lock()
      guard error == nil else { lock.unlock(); dataTask.cancel(); return }
      guard chunk.count <= maximumBytes - data.count else { error = CompanionError.capacity; data.removeAll(keepingCapacity: false); lock.unlock(); dataTask.cancel(); return }
      data.append(chunk); lock.unlock()
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError completionError: Error?) {
      lock.lock(); if error == nil { error = completionError }; lock.unlock(); done.signal()
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
      newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    func read() -> (data: Data, metadata: HTTPURLResponse?, error: Error?) { lock.lock(); defer { lock.unlock() }; return (data, metadata, error) }
  }
}
