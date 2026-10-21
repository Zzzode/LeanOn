package com.zzzode.leanon.bridge

import org.junit.Assert.*
import org.junit.Test

class PendingRequestTest {
  @Test fun secondRequestCannotReplaceTheFirstAndCompletionIsOnce() {
    val pending = PendingRequest<Boolean>()
    val first = mutableListOf<Boolean>()
    val second = mutableListOf<Boolean>()
    assertTrue(pending.begin(first::add))
    assertFalse(pending.begin(second::add))
    pending.complete(false)
    pending.complete(true)
    assertEquals(listOf(false), first)
    assertTrue(second.isEmpty())
    assertTrue(pending.begin(second::add))
    pending.complete(true)
    assertEquals(listOf(true), second)
  }

  @Test fun callbackCanBeginANewRequestWithoutLosingIt() {
    val pending = PendingRequest<String>()
    val results = mutableListOf<String>()
    pending.begin { result -> results.add(result); assertTrue(pending.begin(results::add)) }
    pending.complete("first")
    pending.complete("second")
    assertEquals(listOf("first", "second"), results)
  }
}
