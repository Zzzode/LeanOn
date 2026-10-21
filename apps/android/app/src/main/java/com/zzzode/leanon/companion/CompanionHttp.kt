package com.zzzode.leanon.companion

import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URI

class CompanionFailure(val code: String, message: String) : Exception(message)
internal interface CompanionTransport {
  fun request(method: String, path: String, body: JSONObject? = null, token: String? = null): JSONObject
  fun binary(method: String, path: String, bytes: ByteArray?, token: String): ByteArray = throw CompanionFailure("unavailable", "Binary photo transport is unavailable")
}
internal class CompanionHttp(private val endpoint: String) : CompanionTransport {
  companion object {
    fun validateEndpoint(value: String): String {
      val uri = runCatching { URI(value) }.getOrNull() ?: throw CompanionFailure("invalid-request", "Invalid relay address")
      if (uri.userInfo != null || uri.fragment != null || uri.query != null || uri.host == null || uri.path !in listOf("", "/")) throw CompanionFailure("invalid-request", "Invalid relay address")
      if (uri.port != -1 && uri.port !in 1..65535) throw CompanionFailure("invalid-request", "Invalid relay port")
      if (uri.scheme != "https" && !(uri.scheme == "http" && uri.host in listOf("10.0.2.2", "127.0.0.1", "localhost", "::1"))) throw CompanionFailure("invalid-request", "Plain HTTP is limited to local QA")
      return value.trimEnd('/')
    }
  }
  override fun binary(method: String, path: String, bytes: ByteArray?, token: String): ByteArray {
    if (!path.startsWith("/v2/") || method !in listOf("GET", "PUT")) throw CompanionFailure("invalid-request", "Invalid photo request")
    val maximum = 20 * 1024 * 1024 + 28
    if (bytes != null && bytes.size > maximum) throw CompanionFailure("capacity", "Photo exceeds supported size")
    val connection = URI(validateEndpoint(endpoint) + path).toURL().openConnection() as HttpURLConnection
    connection.requestMethod = method; connection.connectTimeout = 15_000; connection.readTimeout = 30_000; connection.instanceFollowRedirects = false
    connection.setRequestProperty("Authorization", "Bearer $token"); connection.setRequestProperty("Accept", "application/octet-stream")
    try {
      if (bytes != null) { connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/octet-stream"); connection.setFixedLengthStreamingMode(bytes.size); connection.outputStream.use { it.write(bytes) } }
      val status = connection.responseCode; val output = ByteArrayOutputStream()
      (if (status in 200..299) connection.inputStream else connection.errorStream)?.use { input ->
        val buffer = ByteArray(16384); while (true) { val n = input.read(buffer); if (n < 0) break; if (output.size() + n > maximum) throw CompanionFailure("capacity", "Photo response exceeds supported size"); output.write(buffer, 0, n) }
      }
      if (status !in 200..299) throw CompanionFailure(if (status == 401) "unauthorized" else if (status == 403) "not-authorized" else if (status == 409) "conflict" else "unavailable", "Private photo request failed")
      return output.toByteArray()
    } finally { connection.disconnect() }
  }
  override fun request(method: String, path: String, body: JSONObject?, token: String?): JSONObject {
    val connection = URI(validateEndpoint(endpoint) + path).toURL().openConnection() as HttpURLConnection
    connection.requestMethod = method; connection.connectTimeout = 15_000; connection.readTimeout = 15_000
    connection.instanceFollowRedirects = false
    connection.setRequestProperty("Accept", "application/json"); token?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
    try {
      if (body != null) {
        val bytes = body.toString().toByteArray(Charsets.UTF_8)
        if (bytes.size > 96 * 1024 * 1024) throw CompanionFailure("invalid-request", "Sync request exceeds supported size")
        connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json"); connection.setFixedLengthStreamingMode(bytes.size)
        connection.outputStream.use { it.write(bytes) }
      }
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val output = ByteArrayOutputStream()
      stream?.use { input -> val buffer = ByteArray(16 * 1024); while (true) { val n = input.read(buffer); if (n < 0) break; if (output.size() + n > 96 * 1024 * 1024) throw CompanionFailure("unavailable", "Sync response exceeds supported size"); output.write(buffer, 0, n) } }
      val value = runCatching { JSONObject(output.toString("UTF-8")) }.getOrElse { throw CompanionFailure("unavailable", "Invalid relay response") }
      if (status !in 200..299) {
        val serverCode = value.optJSONObject("error")?.optString("code") ?: "relay-error"
        throw CompanionFailure(if (status == 404 && serverCode == "deletion_not_found") "deletion_not_found" else if (status == 401) "unauthorized" else if (status == 403) "not-authorized" else if (status == 409) "conflict" else if (status == 410) "invite-expired" else "unavailable", serverCode)
      }
      return value
    } finally { connection.disconnect() }
  }
}
