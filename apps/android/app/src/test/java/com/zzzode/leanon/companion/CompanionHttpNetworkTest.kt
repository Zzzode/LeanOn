package com.zzzode.leanon.companion

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.io.IOException
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/** Real random-port loopback transport, independent of the persistent QA relay and accounts. */
class CompanionHttpNetworkTest {
  private data class Request(val method: String, val path: String, val headers: Map<String, String>, val body: String)
  private class LoopbackServer(private val handle: (Request, OutputStream) -> Unit) : Closeable {
    private val socket = ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"))
    private val failure = AtomicReference<Throwable?>()
    @Volatile private var closed = false
    val endpoint = "http://127.0.0.1:${socket.localPort}"
    private val worker = Thread({
      try {
        while (!closed) socket.accept().use { client ->
          client.soTimeout = 5000; client.tcpNoDelay = true
          val input = client.getInputStream(); val bytes = ByteArrayOutputStream(); var tail = 0
          while (tail != 0x0d0a0d0a) {
            val value = input.read(); if (value < 0) throw IOException("Incomplete fixture request")
            bytes.write(value); if (bytes.size() > 16384) throw IOException("Fixture request header too large")
            tail = (tail shl 8) or value
          }
          val lines = bytes.toString("US-ASCII").split("\r\n"); val first = lines[0].split(" ")
          val headers = lines.drop(1).filter { it.contains(':') }.associate { it.substringBefore(':').lowercase() to it.substringAfter(':').trim() }
          val body = ByteArray(headers["content-length"]?.toInt() ?: 0)
          var offset = 0
          while (offset < body.size) { val count = input.read(body, offset, body.size - offset); if (count < 0) throw IOException("Incomplete fixture body"); offset += count }
          handle(Request(first[0], first[1], headers, body.toString(Charsets.UTF_8)), client.getOutputStream())
        }
      } catch (error: Throwable) { if (!closed) failure.set(error) }
    }, "leanon-public-loopback-fixture").apply { isDaemon = true; start() }
    override fun close() { closed = true; socket.close(); worker.join(5000); failure.get()?.let { throw AssertionError("Loopback fixture failed", it) } }
  }
  private fun response(output: OutputStream, status: Int, body: String, location: String? = null) {
    val bytes = body.toByteArray()
    output.write(("HTTP/1.1 $status PUBLIC\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n" + (location?.let { "Location: $it\r\n" } ?: "") + "\r\n").toByteArray())
    output.write(bytes); output.flush()
  }
  private fun chunk(output: OutputStream, bytes: ByteArray) {
    output.write((bytes.size.toString(16) + "\r\n").toByteArray()); output.write(bytes); output.write("\r\n".toByteArray())
  }

  @Test fun methodPreservingRedirectsNeverForwardCredentialsOrBody() {
    val targetRequests = AtomicInteger(); val sourceRequests = AtomicInteger()
    LoopbackServer { _, output -> targetRequests.incrementAndGet(); response(output, 200, "{\"public\":\"unexpected redirect\"}") }.use { target ->
      LoopbackServer { request, output ->
        sourceRequests.incrementAndGet()
        assertEquals("POST", request.method)
        assertEquals("Bearer PUBLIC-synthetic-token", request.headers["authorization"])
        assertEquals("PUBLIC synthetic body", JSONObject(request.body).getString("public"))
        response(output, request.path.substringAfterLast('-').toInt(), "{\"error\":{\"code\":\"PUBLIC redirect\"}}", target.endpoint + "/target")
      }.use { source ->
        for (status in listOf(307, 308)) {
          val failure = assertThrows(CompanionFailure::class.java) {
            CompanionHttp(source.endpoint).request("POST", "/redirect-$status", JSONObject().put("public", "PUBLIC synthetic body"), "PUBLIC-synthetic-token")
          }
          assertEquals("unavailable", failure.code)
        }
        assertEquals(2, sourceRequests.get()); assertEquals(0, targetRequests.get())
      }
    }
  }

  @Test fun chunkedJsonIsReadAndAResponseBeyondTheRealLimitIsRejected() {
    LoopbackServer { request, output ->
      output.write("HTTP/1.1 200 PUBLIC\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n".toByteArray())
      if (request.path == "/chunked") {
        chunk(output, "{\"public\":".toByteArray()); output.flush()
        chunk(output, "\"chunked JSON\"}".toByteArray()); output.write("0\r\n\r\n".toByteArray()); output.flush()
      } else {
        // Stream 96 MiB + one byte without allocating an equally large fixture body.
        val bytes = ByteArray(16 * 1024) { 32 }
        runCatching { repeat(6144) { chunk(output, bytes) }; chunk(output, byteArrayOf(32)); output.write("0\r\n\r\n".toByteArray()); output.flush() }
      }
    }.use { source ->
      assertEquals("chunked JSON", CompanionHttp(source.endpoint).request("GET", "/chunked").getString("public"))
      val failure = assertThrows(CompanionFailure::class.java) { CompanionHttp(source.endpoint).request("GET", "/oversized") }
      assertEquals("unavailable", failure.code)
      assertEquals("Sync response exceeds supported size", failure.message)
    }
  }
}
