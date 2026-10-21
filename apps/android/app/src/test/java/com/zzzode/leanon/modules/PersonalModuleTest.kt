package com.zzzode.leanon.modules

import com.lynx.react.bridge.JavaOnlyMap
import com.zzzode.leanon.personal.PersonalFailure
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class PersonalModuleTest {
  private val request = JSONObject("{\"operationId\":\"op\",\"expectedRevision\":0,\"mutation\":{\"type\":\"set-dietary-preferences\",\"preferences\":{\"pattern\":\"none\",\"excludedFoodIds\":[],\"notes\":\"\",\"future\":{\"nullable\":null,\"boolean\":false,\"zero\":0}}}}")
  @Test fun wirePreservesExplicitNullFalseZero() {
    val decoded = decodePersonalRequest(JavaOnlyMap().apply { putString("__leanonPersonalRequestJSON", request.toString()) })
    val future = decoded.third.getJSONObject("preferences").getJSONObject("future")
    assertTrue(future.has("nullable") && future.isNull("nullable")); assertFalse(future.getBoolean("boolean")); assertEquals(0, future.getInt("zero"))
  }
  @Test fun malformedMixedWrongTypeAndOversizedEnvelopesRejected() {
    val cases = listOf(JavaOnlyMap().apply { putString("__leanonPersonalRequestJSON", "broken") }, JavaOnlyMap().apply { putBoolean("__leanonPersonalRequestJSON", false) }, JavaOnlyMap().apply { putString("__leanonPersonalRequestJSON", request.toString()); putString("operationId", "mixed") }, JavaOnlyMap().apply { putString("__leanonPersonalRequestJSON", " ".repeat(1024 * 1024 + 1)) })
    for (item in cases) assertThrows(PersonalFailure::class.java) { decodePersonalRequest(item) }
  }
}
