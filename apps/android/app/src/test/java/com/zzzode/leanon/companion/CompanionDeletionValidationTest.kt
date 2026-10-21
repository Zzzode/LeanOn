package com.zzzode.leanon.companion

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class CompanionDeletionValidationTest {
  private fun receipt() = JSONObject().put("version", 1).put("operationId", "PUBLIC-operation").put("accountId", "PUBLIC-account").put("status", "deleted").put("deletedAt", 1000)
  @Test fun onlyTheExactAccountOperationAndStrictReceiptCanConfirmDeletion() {
    CompanionValidation.deletionReceipt(receipt(), "PUBLIC-operation", "PUBLIC-account")
    for (invalid in listOf(
      receipt().put("accountId", "other-account"), receipt().put("operationId", "other-operation"), receipt().put("deletedAt", "1000"),
      receipt().put("deletedAt", 1000.5), receipt().put("deletedAt", -1), receipt().put("status", true), receipt().put("proof", "unexpected")
    )) assertThrows(IOException::class.java) { CompanionValidation.deletionReceipt(invalid, "PUBLIC-operation", "PUBLIC-account") }
  }
  @Test fun acknowledgementIsBoundToTheOperationAndHasNoExtraCredentials() {
    val acknowledgement = JSONObject().put("version", 1).put("operationId", "PUBLIC-operation").put("status", "acknowledged")
    CompanionValidation.deletionAcknowledgement(acknowledgement, "PUBLIC-operation")
    assertThrows(IOException::class.java) { CompanionValidation.deletionAcknowledgement(acknowledgement, "other-operation") }
    assertThrows(IOException::class.java) { CompanionValidation.deletionAcknowledgement(JSONObject(acknowledgement.toString()).put("proof", "unexpected"), "PUBLIC-operation") }
  }
}
