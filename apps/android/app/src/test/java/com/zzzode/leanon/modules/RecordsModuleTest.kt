package com.zzzode.leanon.modules

import com.lynx.react.bridge.JavaOnlyMap
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class RecordsModuleTest {
  @Test fun privateJsonWirePreservesExplicitNullAndFalse() {
    val request = JSONObject("""{"operationId":"op","expectedRevision":0,"mutation":{"type":"save-profile","goalWeightKg":null,"weeklyLossKg":null,"safetyFlags":{"pregnant":false,"breastfeeding":null,"eatingDisorderRisk":null}}}""")
    val decoded = decodeRecordsRequest(JavaOnlyMap().apply { putString("__leanonRecordsRequestJSON", request.toString()) })
    assertEquals("op", decoded.first)
    assertEquals(0L, decoded.second)
    assertTrue(decoded.third.has("goalWeightKg"))
    assertTrue(decoded.third.isNull("goalWeightKg"))
    assertEquals(false, decoded.third.getJSONObject("safetyFlags").getBoolean("pregnant"))
    assertTrue(decoded.third.getJSONObject("safetyFlags").has("breastfeeding"))
  }
  @Test fun directMapDoesNotInventMissingNullableFields() {
    val decoded = decodeRecordsRequest(JavaOnlyMap().apply {
      putString("operationId", "op"); putInt("expectedRevision", 0)
      putMap("mutation", JavaOnlyMap().apply { putString("type", "save-profile"); putMap("safetyFlags", JavaOnlyMap()) })
    })
    assertFalse(decoded.third.has("goalWeightKg"))
    assertFalse(decoded.third.getJSONObject("safetyFlags").has("pregnant"))
  }
  @Test fun rejectsWrongTypedRevisionInsideWire() {
    try {
      decodeRecordsRequest(JavaOnlyMap().apply { putString("__leanonRecordsRequestJSON", """{"operationId":"op","expectedRevision":false,"mutation":{}}""") })
      fail("Wrong typed revision must fail")
    } catch (_: InvalidRecordRequest) { }
  }
  @Test fun rejectsMixedWireAndDirectRequestFields() {
    try {
      decodeRecordsRequest(JavaOnlyMap().apply {
        putString("__leanonRecordsRequestJSON", """{"operationId":"op","expectedRevision":0,"mutation":{}}""")
        putString("operationId", "mixed")
      })
      fail("Mixed envelope must fail")
    } catch (_: InvalidRecordRequest) { }
  }

}
