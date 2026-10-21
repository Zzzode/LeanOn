import Foundation

protocol FoodProductLookingUp {
  func lookup(_ barcode: String, completion: @escaping (Result<NSDictionary?, Error>) -> Void)
}

protocol FoodLookupTransport {
  func send(_ request: URLRequest, completion: @escaping (Data?, URLResponse?, Error?) -> Void)
}

final class FoodLookupSession: FoodLookupTransport {
  private let session: URLSession

  init() {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 8
    configuration.timeoutIntervalForResource = 8
    configuration.httpShouldSetCookies = false
    configuration.urlCache = nil
    session = URLSession(configuration: configuration)
  }

  func send(_ request: URLRequest, completion: @escaping (Data?, URLResponse?, Error?) -> Void) {
    session.dataTask(with: request, completionHandler: completion).resume()
  }

  deinit { session.invalidateAndCancel() }
}

enum FoodLookupError: Error {
  case invalidBarcode, invalidResponse, httpStatus(Int)
}

/// Returns OFF's raw product; shared TypeScript owns all nutrition conversion.
final class OpenFoodFactsClient: FoodProductLookingUp {
  private let transport: FoodLookupTransport
  private static let fields = "product_name,generic_name,nutriments,serving_quantity,serving_size,serving_quantity_unit,product_quantity_unit"

  init(transport: FoodLookupTransport = FoodLookupSession()) { self.transport = transport }

  static func request(_ barcode: String) throws -> URLRequest {
    guard let code = ProductBarcode.normalize(barcode),
      let url = URL(string: "https://world.openfoodfacts.org/api/v2/product/\(code).json?fields=\(fields)")
    else { throw FoodLookupError.invalidBarcode }
    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8)
    request.httpMethod = "GET"
    request.setValue("LeanOn/0.1 (https://github.com/Zzzode/LeanOn)", forHTTPHeaderField: "User-Agent")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    return request
  }

  func lookup(_ barcode: String, completion: @escaping (Result<NSDictionary?, Error>) -> Void) {
    let request: URLRequest
    do { request = try Self.request(barcode) }
    catch { completion(.failure(error)); return }
    transport.send(request) { data, response, error in
      if let error { completion(.failure(error)); return }
      guard let response = response as? HTTPURLResponse else {
        completion(.failure(FoodLookupError.invalidResponse)); return
      }
      if response.statusCode == 404 { completion(.success(nil)); return }
      guard response.statusCode == 200 else {
        completion(.failure(FoodLookupError.httpStatus(response.statusCode))); return
      }
      do {
        guard let data, data.count <= 2_000_000,
          let envelope = try JSONSerialization.jsonObject(with: data) as? NSDictionary,
          let status = envelope["status"] as? NSNumber,
          CFGetTypeID(status) != CFBooleanGetTypeID()
        else { throw FoodLookupError.invalidResponse }
        if status.doubleValue == 0 { completion(.success(nil)); return }
        guard status.doubleValue == 1, let product = envelope["product"] as? NSDictionary else {
          throw FoodLookupError.invalidResponse
        }
        completion(.success(product))
      } catch { completion(.failure(error)) }
    }
  }
}
