package com.zzzode.leanon.data

import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
import java.nio.channels.FileChannel
import java.io.IOException

/** Commit a complete snapshot without truncating the last good private record file. */
internal fun writeRecordsAtomically(file: File, contents: String) = writeBytesAtomically(file, contents.toByteArray(Charsets.UTF_8))

internal fun writeBytesAtomically(file: File, contents: ByteArray) {
  val temporary = File.createTempFile("records-", ".tmp", file.parentFile)
  try {
    FileOutputStream(temporary).use { output ->
      output.write(contents)
      output.fd.sync()
    }
    Files.move(
      temporary.toPath(), file.toPath(),
      StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING,
    )
    try { syncPrivateDirectory(file.parentFile ?: throw IOException("Private directory unavailable")) }
    catch (error: Exception) { throw AtomicDurabilityUncertain("Atomic replacement directory sync failed", error) }
  } finally {
    temporary.delete()
  }
}

/** A published rename with an uncertain persistence barrier must never be treated as a pre-write failure. */
internal class AtomicDurabilityUncertain(message: String, cause: Throwable) : IOException(message, cause)
internal fun syncPrivateDirectory(directory: File) {
  if (System.getProperty("java.vm.name")?.contains("Dalvik") == true) {
    val descriptor = android.system.Os.open(directory.absolutePath, android.system.OsConstants.O_RDONLY, 0)
    try { android.system.Os.fsync(descriptor) } finally { android.system.Os.close(descriptor) }
  } else {
    FileChannel.open(directory.toPath(), StandardOpenOption.READ).use { it.force(true) }
  }
}
