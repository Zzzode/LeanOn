package com.zzzode.leanon.ble

import org.junit.Assert.*
import org.junit.Test

class BleSubscriptionTest {
  @Test fun connectedReadinessRequiresTheCurrentConnectionsSuccessfulAcknowledgementOnce() {
    val subscription = BleSubscription()
    val connection = Any()
    assertEquals(SubscriptionAcknowledgement.IGNORED, subscription.acknowledge(connection, true))
    subscription.begin(connection)
    assertEquals(SubscriptionAcknowledgement.READY, subscription.acknowledge(connection, true))
    assertEquals(SubscriptionAcknowledgement.IGNORED, subscription.acknowledge(connection, true))
  }

  @Test fun failedAndStaleAcknowledgementsCannotPairANewConnection() {
    val subscription = BleSubscription()
    val previous = Any(); val current = Any()
    subscription.begin(previous)
    subscription.begin(current)
    assertEquals(SubscriptionAcknowledgement.IGNORED, subscription.acknowledge(previous, true))
    assertEquals(SubscriptionAcknowledgement.FAILED, subscription.acknowledge(current, false))
    subscription.begin(current)
    subscription.reset()
    assertEquals(SubscriptionAcknowledgement.IGNORED, subscription.acknowledge(current, true))
  }
}
