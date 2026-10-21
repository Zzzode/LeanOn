import XCTest
@testable import LeanOn

final class OpenFoodFactsTests: XCTestCase {
  private final class Transport: FoodLookupTransport {
    var request: URLRequest?
    var data: Data?
    var code = 200
    var error: Error?
    func send(_ request: URLRequest, completion: @escaping (Data?, URLResponse?, Error?) -> Void) {
      self.request = request
      completion(data, HTTPURLResponse(url: request.url!, statusCode: code, httpVersion: nil, headerFields: nil), error)
    }
  }

  func testRequestContainsOnlyBarcodeAndRequiredFieldsWithTimeout() throws {
    let request = try OpenFoodFactsClient.request("5901234123457")
    XCTAssertEqual(request.url?.host, "world.openfoodfacts.org")
    XCTAssertEqual(request.url?.path, "/api/v2/product/5901234123457.json")
    XCTAssertEqual(request.timeoutInterval, 8)
    XCTAssertEqual(request.httpMethod, "GET")
    XCTAssertNil(request.httpBody)
    XCTAssertEqual(request.value(forHTTPHeaderField: "User-Agent"), "LeanOn/0.1 (https://github.com/Zzzode/LeanOn)")
    let fields = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems
    XCTAssertEqual(fields?.count, 1)
    XCTAssertEqual(fields?.first?.name, "fields")
    XCTAssertEqual(fields?.first?.value,
      "product_name,generic_name,nutriments,serving_quantity,serving_size,serving_quantity_unit,product_quantity_unit")
    XCTAssertThrowsError(try OpenFoodFactsClient.request(""))
    XCTAssertThrowsError(try OpenFoodFactsClient.request("\n"))
    XCTAssertThrowsError(try OpenFoodFactsClient.request(String(repeating: "1", count: 129)))
    XCTAssertThrowsError(try OpenFoodFactsClient.request("a/b?x#y"))
    XCTAssertThrowsError(try OpenFoodFactsClient.request("3017620422004"))
    let upc = try OpenFoodFactsClient.request("036000291452")
    XCTAssertEqual(upc.url?.path, "/api/v2/product/0036000291452.json")
  }

  func testKnownProductPassesThroughWithoutNutritionConversion() {
    let transport = Transport()
    transport.data = Data(#"{"status":1,"product":{"product_name":"Fixture","nutriments":{"energy-kcal_100g":130},"serving_quantity":100}}"#.utf8)
    OpenFoodFactsClient(transport: transport).lookup("5901234123457") { result in
      switch result {
      case .success(let product):
        XCTAssertEqual(product?["product_name"] as? String, "Fixture")
        XCTAssertEqual((product?["nutriments"] as? NSDictionary)?["energy-kcal_100g"] as? Double, 130)
      case .failure: XCTFail("Valid fixture should pass through")
      }
    }
  }

  func testNotFoundStatusAndHTTP404AreSuccessfulMisses() {
    for code in [200, 404] {
      let transport = Transport()
      transport.code = code
      transport.data = Data(#"{"status":0}"#.utf8)
      OpenFoodFactsClient(transport: transport).lookup("96385074") { result in
        switch result {
        case .success(let product): XCTAssertNil(product)
        case .failure: XCTFail("A missing product is not a transport failure")
        }
      }
    }
  }

  func testMalformedResponseAndTransportFailureReject() {
    let bodies = ["not-json", #"{"product":{}}"#, #"{"status":true,"product":{}}"#,
      #"{"status":"1","product":{}}"#, #"{"status":1}"#, #"{"status":2,"product":{}}"#]
    for body in bodies {
      let transport = Transport()
      transport.data = Data(body.utf8)
      OpenFoodFactsClient(transport: transport).lookup("96385074") { result in
        if case .success = result { XCTFail(body) }
      }
    }
    let transport = Transport()
    transport.code = 503
    OpenFoodFactsClient(transport: transport).lookup("96385074") {
      if case .success = $0 { XCTFail("HTTP 503") }
    }
    transport.error = URLError(.timedOut)
    OpenFoodFactsClient(transport: transport).lookup("96385074") {
      if case .success = $0 { XCTFail("Timeout") }
    }
  }

  func testInvalidBarcodeNeverStartsNetworkRequest() {
    let transport = Transport()
    OpenFoodFactsClient(transport: transport).lookup(" ") {
      if case .success = $0 { XCTFail("Invalid barcode") }
    }
    XCTAssertNil(transport.request)
  }

  func testVolumeUnitsPassThroughForSharedMapperRatherThanInventingGrams() {
    let transport = Transport()
    transport.data = Data(#"{"status":1,"product":{"product_name":"Drink fixture","nutriments":{"energy-kcal_100g":48},"serving_quantity":250,"serving_quantity_unit":"ml","product_quantity_unit":"ml"}}"#.utf8)
    OpenFoodFactsClient(transport: transport).lookup("5901234123457") { result in
      switch result {
      case .success(let product):
        XCTAssertEqual(product?["serving_quantity"] as? Double, 250)
        XCTAssertEqual(product?["serving_quantity_unit"] as? String, "ml")
        XCTAssertEqual(product?["product_quantity_unit"] as? String, "ml")
      case .failure: XCTFail("Raw volume units must remain available to shared mapping")
      }
    }
  }

  func testFoodModuleReturnsContractAndErrorsOnMainQueue() {
    let transport = Transport()
    transport.data = Data(#"{"status":1,"product":{"product_name":"Fixture"}}"#.utf8)
    let module = FoodModule(client: OpenFoodFactsClient(transport: transport))
    let found = expectation(description: "product")
    module.lookupProduct(["barcode": "96385074"]) {
      XCTAssertTrue(Thread.isMainThread)
      XCTAssertEqual($0["found"] as? Bool, true)
      XCTAssertEqual(($0["product"] as? NSDictionary)?["product_name"] as? String, "Fixture")
      found.fulfill()
    }
    wait(for: [found], timeout: 2)
    for value: Any in ["", true, 12345678, NSNull()] {
      module.lookupProduct(["barcode": value]) { XCTAssertEqual($0["code"] as? String, "invalid-request") }
    }
    transport.error = URLError(.notConnectedToInternet)
    let failed = expectation(description: "offline")
    module.lookupProduct(["barcode": "96385074"]) {
      XCTAssertEqual($0["code"] as? String, "unavailable")
      XCTAssertEqual(($0["details"] as? NSDictionary)?["reason"] as? String, "offline")
      XCTAssertEqual($0["retriable"] as? Bool, true)
      XCTAssertNil($0["found"])
      failed.fulfill()
    }
    wait(for: [failed], timeout: 2)
  }

  func testLookupErrorsPreserveTimeoutOfflineAndServiceReasons() {
    let transport = Transport()
    let module = FoodModule(client: OpenFoodFactsClient(transport: transport))
    let cases: [(Error, String)] = [(URLError(.timedOut), "timeout"),
      (URLError(.notConnectedToInternet), "offline"), (URLError(.networkConnectionLost), "offline"),
      (FoodLookupError.invalidResponse, "service-response"), (FoodLookupError.httpStatus(503), "service-response")]
    for (error, reason) in cases {
      transport.error = error
      let done = expectation(description: reason)
      module.lookupProduct(["barcode": "3017620422003"]) {
        XCTAssertEqual($0["code"] as? String, "unavailable")
        XCTAssertEqual($0["retriable"] as? Bool, true)
        XCTAssertEqual(($0["details"] as? NSDictionary)?["reason"] as? String, reason)
        done.fulfill()
      }
      wait(for: [done], timeout: 2)
    }
  }
}
