import XCTest
import Foundation
import Darwin
@testable import LeanOn

/// Real TCP fixtures on ephemeral loopback ports, independent of the QA relay/accounts.
final class CompanionHTTPBoundaryTests: XCTestCase {
  func testActual307And308NeverForwardPostBodyOrBearer() throws {
    for status in [307, 308] {
      let destination = try HTTPBoundaryListener { connection in
        connection.send(Data("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".utf8))
      }
      let origin = try HTTPBoundaryListener { connection in
        let body = Data("{\"error\":{\"code\":\"redirect-denied\"}}".utf8)
        connection.send(Data("HTTP/1.1 \(status) Redirect\r\nLocation: \(destination.endpoint)/v1/redirected\r\nContent-Type: application/json\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n".utf8) + body)
      }
      defer { origin.stop(); destination.stop() }
      XCTAssertThrowsError(try CompanionHTTP().request(endpoint: origin.endpoint, method: "POST", path: "/v1/public-fixture",
        body: ["fixture": "PUBLIC nonsecret redirect sentinel"], token: "PUBLIC fake bearer")) { error in
        XCTAssertEqual((error as? CompanionError)?.code, "redirect-denied")
      }
      XCTAssertEqual(origin.requestCount, 1)
      XCTAssertEqual(destination.requestCount, 0, "Redirects must not contact the destination, including preserving POST on 307/308")
    }
  }

  func testActualDeclaredContentLengthAboveDefault96MiBRejectedBeforeAllocatingBody() throws {
    let listener = try HTTPBoundaryListener { connection in
      guard connection.send(Data("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: \(96 * 1024 * 1024 + 1)\r\nConnection: close\r\n\r\n".utf8)) else { return }
      // Offer the complete advertised stream; cancellation may stop this loop early.
      // An incomplete/header-only response can be rejected by CFNetwork before delegation.
      let block = Data(repeating: 0x20, count: 256 * 1024)
      for _ in 0..<384 { guard connection.send(block) else { return } }
      connection.send(Data("0".utf8))
    }
    defer { listener.stop() }
    assertCapacity(CompanionHTTP(), endpoint: listener.endpoint)
    XCTAssertEqual(listener.requestCount, 1)
  }

  func testActualChunkedStreamAboveDefault96MiBRejectedWhileReceiving() throws {
    let listener = try HTTPBoundaryListener { connection in
      guard connection.send(Data("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n".utf8)) else { return }
      let block = Data(repeating: 0x20, count: 256 * 1024)
      for _ in 0..<385 {
        guard connection.send(Data("40000\r\n".utf8)), connection.send(block), connection.send(Data("\r\n".utf8)) else { return }
      }
      connection.send(Data("0\r\n\r\n".utf8))
    }
    defer { listener.stop() }
    assertCapacity(CompanionHTTP(), endpoint: listener.endpoint)
    XCTAssertEqual(listener.requestCount, 1)
  }

  func testActualSmallLimitAcceptsExactJSONAndRejectsUnknownLengthOverflow() throws {
    let body = Data("{\"publicFixture\":true}".utf8)
    let valid = try HTTPBoundaryListener { connection in
      connection.send(Data("HTTP/1.1 200 OK\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n".utf8) + body)
    }
    defer { valid.stop() }
    XCTAssertEqual(try CompanionHTTP(maximumResponseBytes: body.count).request(endpoint: valid.endpoint, method: "GET",
      path: "/v1/public-fixture", body: nil, token: nil)["publicFixture"] as? Bool, true)
    let invalid = try HTTPBoundaryListener { connection in
      connection.send(Data("HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n".utf8) + body + Data([0x20]))
    }
    defer { invalid.stop() }
    assertCapacity(CompanionHTTP(maximumResponseBytes: body.count), endpoint: invalid.endpoint)
  }

  private func assertCapacity(_ transport: CompanionHTTP, endpoint: URL) {
    XCTAssertThrowsError(try transport.request(endpoint: endpoint, method: "GET", path: "/v1/public-fixture", body: nil, token: nil)) { error in
      XCTAssertEqual((error as? CompanionError)?.code, "capacity-exceeded", "A streamed capacity rejection must remain distinguishable from offline/JSON errors")
    }
  }
}

private final class HTTPBoundaryListener {
  final class Connection {
    private let descriptor: Int32
    init(_ descriptor: Int32) { self.descriptor = descriptor }
    @discardableResult func send(_ bytes: Data) -> Bool {
      bytes.withUnsafeBytes { buffer in
        guard let base = buffer.baseAddress else { return true }
        var offset = 0
        while offset < bytes.count {
          let count = Darwin.send(descriptor, base.advanced(by: offset), bytes.count - offset, 0)
          guard count > 0 else { return false }; offset += count
        }
        return true
      }
    }
  }
  let endpoint: URL
  private let descriptor: Int32
  private let lock = NSLock()
  private var stopped = false, requests = 0
  var requestCount: Int { lock.lock(); defer { lock.unlock() }; return requests }
  init(_ response: @escaping (Connection) -> Void) throws {
    let socketDescriptor = socket(AF_INET, SOCK_STREAM, 0)
    descriptor = socketDescriptor
    guard socketDescriptor >= 0 else { throw POSIXError(.EIO) }
    var address = sockaddr_in(); address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET); address.sin_addr.s_addr = inet_addr("127.0.0.1")
    let bound = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(socketDescriptor, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
    }
    guard bound == 0, listen(socketDescriptor, 2) == 0 else { close(socketDescriptor); throw POSIXError(.EIO) }
    var size = socklen_t(MemoryLayout<sockaddr_in>.size)
    _ = withUnsafeMutablePointer(to: &address) { pointer in pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(socketDescriptor, $0, &size) } }
    endpoint = URL(string: "http://127.0.0.1:\(UInt16(bigEndian: address.sin_port))")!
    DispatchQueue.global(qos: .utility).async { [weak self] in
      guard let self else { return }
      while true {
        self.lock.lock(); let active = !self.stopped; self.lock.unlock(); if !active { return }
        var pollDescriptor = pollfd(fd: self.descriptor, events: Int16(POLLIN), revents: 0)
        guard poll(&pollDescriptor, 1, 100) > 0 else { continue }
        let client = accept(self.descriptor, nil, nil); guard client >= 0 else { return }
        var noPipe: Int32 = 1; setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &noPipe, socklen_t(MemoryLayout<Int32>.size))
        var timeout = timeval(tv_sec: 5, tv_usec: 0)
        setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
        setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
        var received = Data(), buffer = [UInt8](repeating: 0, count: 4096)
        while received.count < 64 * 1024 {
          let count = recv(client, &buffer, buffer.count, 0); if count <= 0 { break }
          received.append(contentsOf: buffer.prefix(count))
          if received.range(of: Data("\r\n\r\n".utf8)) != nil { break }
        }
        if !received.isEmpty { self.lock.lock(); self.requests += 1; self.lock.unlock(); response(Connection(client)) }
        shutdown(client, SHUT_RDWR); close(client)
      }
    }
  }
  func stop() { lock.lock(); defer { lock.unlock() }; if !stopped { stopped = true; shutdown(descriptor, SHUT_RDWR); close(descriptor) } }
  deinit { stop() }
}
