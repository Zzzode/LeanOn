package com.zzzode.leanon.ble

internal enum class SubscriptionAcknowledgement { IGNORED, READY, FAILED }

/** A characteristic subscription is usable only after this connection's CCCD write acknowledgement. */
internal class BleSubscription {
  private var connection: Any? = null

  @Synchronized fun begin(owner: Any) { connection = owner }

  @Synchronized fun reset() { connection = null }

  @Synchronized fun acknowledge(owner: Any, success: Boolean): SubscriptionAcknowledgement {
    if (connection !== owner) return SubscriptionAcknowledgement.IGNORED
    connection = null
    return if (success) SubscriptionAcknowledgement.READY else SubscriptionAcknowledgement.FAILED
  }
}
