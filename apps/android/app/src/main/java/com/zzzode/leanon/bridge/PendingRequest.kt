package com.zzzode.leanon.bridge

/** A second native request must not silently replace a promise awaiting platform input. */
internal class PendingRequest<T> {
  private var callback: ((T) -> Unit)? = null

  @Synchronized fun begin(value: (T) -> Unit): Boolean {
    if (callback != null) return false
    callback = value
    return true
  }

  @Synchronized fun take(): ((T) -> Unit)? = callback.also { callback = null }

  fun complete(value: T) { take()?.invoke(value) }
}
