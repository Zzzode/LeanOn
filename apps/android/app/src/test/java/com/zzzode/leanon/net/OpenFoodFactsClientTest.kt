package com.zzzode.leanon.net

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.net.URL

class OpenFoodFactsClientTest {
  private class Response(url: URL, val status: Int = 200, val body: String) : HttpURLConnection(url) {
    var disconnected = false
    override fun connect() = Unit
    override fun usingProxy() = false
    override fun disconnect() { disconnected = true }
    override fun getResponseCode() = status
    override fun getInputStream() = ByteArrayInputStream(body.toByteArray(Charsets.UTF_8))
  }
  private fun response(body: String, status: Int = 200): Pair<OpenFoodFactsClient, Response> {
    val connection = Response(URL("https://world.openfoodfacts.org"), status, body)
    return OpenFoodFactsClient { connection } to connection
  }

  @Test fun rawPer100NutritionAndMassVolumeUnitFieldsRemainUntouched() {
    val (client, connection) = response("""{"status":1,"product":{"product_name":"Fixture","serving_quantity":250,"serving_quantity_unit":"ml","product_quantity_unit":"ml","nutriments":{"energy-kcal_100g":120,"energy_100g":502.08,"sodium_100g":0.1,"salt_100g":0.25}}}""")
    val product = client.lookup("3017620422003")!!
    assertEquals(120.0, product.getJSONObject("nutriments").getDouble("energy-kcal_100g"), 0.0)
    assertEquals(0.1, product.getJSONObject("nutriments").getDouble("sodium_100g"), 0.0)
    assertEquals("ml", product.getString("serving_quantity_unit"))
    assertEquals("ml", product.getString("product_quantity_unit"))
    assertTrue(connection.disconnected)
  }
  @Test fun onlyExplicitStatusZeroOr404MeanNotFound() {
    for ((body, status) in listOf("{\"status\":0}" to 200, "" to 404)) {
      val (client, connection) = response(body, status)
      assertNull(client.lookup("3017620422003")); assertTrue(connection.disconnected)
    }
  }
  @Test fun malformedAndUnexpectedEnvelopesAreServiceFailuresNotNotFound() {
    for (body in listOf("broken", "{}", "{\"status\":true}", "{\"status\":\"0\"}", "{\"status\":2}", "{\"status\":1}", "{\"status\":1,\"product\":[]}")) {
      val (client, connection) = response(body)
      assertThrows(OffServiceResponseError::class.java) { client.lookup("3017620422003") }
      assertTrue(connection.disconnected)
    }
  }
  @Test fun serverHttpFailureAndRedirectAreRetriableServiceResponses() {
    for (status in listOf(301, 429, 500, 503)) {
      val (client, connection) = response("", status)
      val error = assertThrows(OffServiceResponseError::class.java) { client.lookup("3017620422003") }
      assertEquals("service-response", foodLookupFailureReason(error))
      assertTrue(connection.disconnected)
    }
  }
  @Test fun invalidBarcodeDoesNotOpenAnyConnection() {
    val client = OpenFoodFactsClient { error("Connection must not open") }
    assertThrows(IllegalArgumentException::class.java) { client.lookup("../../../product") }
  }
  @Test fun requestIsCanonicalBoundedAndRequestsUnitMetadata() {
    var requested: URL? = null
    val connection = Response(URL("https://world.openfoodfacts.org"), body = "{\"status\":0}")
    OpenFoodFactsClient { requested = it; connection }.lookup("036000291452")
    assertTrue(requested!!.path.endsWith("/0036000291452.json"))
    assertTrue(requested!!.query.contains("serving_quantity_unit,product_quantity_unit"))
    assertEquals(8000, connection.connectTimeout); assertEquals(8000, connection.readTimeout)
    assertEquals("application/json", connection.getRequestProperty("Accept"))
    assertFalse(connection.instanceFollowRedirects); assertFalse(connection.useCaches)
  }
  @Test fun timeoutAndOfflineStayDistinctFromBadServiceResponse() {
    assertEquals("timeout", foodLookupFailureReason(SocketTimeoutException("fixture")))
    assertEquals("offline", foodLookupFailureReason(UnknownHostException("fixture")))
    assertEquals("service-response", foodLookupFailureReason(OffServiceResponseError("fixture")))
    for (error in listOf(SocketTimeoutException(), UnknownHostException())) {
      assertSame(error, assertThrows(error.javaClass) { OpenFoodFactsClient { throw error }.lookup("3017620422003") })
    }
  }
  @Test fun oversizeResponsesAreRejectedAndDisconnected() {
    val (client, connection) = response("x".repeat(2_000_001))
    assertThrows(OffServiceResponseError::class.java) { client.lookup("3017620422003") }
    assertTrue(connection.disconnected)
  }
}
