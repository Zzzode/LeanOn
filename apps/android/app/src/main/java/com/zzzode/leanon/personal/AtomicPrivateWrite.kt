package com.zzzode.leanon.personal

import java.io.File

/** A prepared ciphertext replacement; publishing memory happens after durable commit. */
internal data class AtomicPrivateWrite(
  val file: File,
  val bytes: ByteArray?,
  val afterCommit: () -> Unit = {},
)
