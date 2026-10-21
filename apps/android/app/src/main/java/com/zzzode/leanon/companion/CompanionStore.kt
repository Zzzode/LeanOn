package com.zzzode.leanon.companion

import android.content.Context
import com.zzzode.leanon.data.writeRecordsAtomically
import com.zzzode.leanon.personal.AtomicPrivateWrite
import com.zzzode.leanon.personal.PersonalCrypto
import com.zzzode.leanon.personal.PersonalKeyStore
import org.json.JSONObject
import java.io.File
import java.io.IOException

/** Only this encrypted native file contains credentials, keys, cursors and received health bytes. */
internal interface CompanionStore { fun read(): JSONObject?; fun write(value: JSONObject); fun prepare(value: JSONObject, afterCommit: () -> Unit): AtomicPrivateWrite }
internal class SecureCompanionStore(context: Context) : CompanionStore {
  private val directory = File(context.filesDir, "companion-v1")
  private val keys = PersonalKeyStore(context, directory, "companion")
  private val file = File(directory, "state.enc")
  @Synchronized override fun read(): JSONObject? {
    if (!file.exists()) return null
    if (file.length() > 128L * 1024 * 1024) throw IOException("Saved companion state exceeds supported size")
    val bytes = PersonalCrypto.localOpen(keys.key(false), file.readText(), "companion")
    return try { JSONObject(String(bytes, Charsets.UTF_8)).also { if (it.optInt("version") != 1) throw IOException("Unsupported companion state") } } finally { bytes.fill(0) }
  }
  @Synchronized override fun prepare(value: JSONObject, afterCommit: () -> Unit): AtomicPrivateWrite {
    val bytes = value.toString().toByteArray(Charsets.UTF_8)
    try { if (bytes.size > 96L * 1024 * 1024 - 2048) throw CompanionFailure("capacity", "Companion state exceeds supported size"); val envelope = PersonalCrypto.localEnvelope(keys.key(true), bytes, "companion").toByteArray(Charsets.UTF_8); if (envelope.size > 128L * 1024 * 1024) throw IOException("Companion state exceeds supported size"); return AtomicPrivateWrite(file, envelope, afterCommit) } finally { bytes.fill(0) }
  }
  @Synchronized override fun write(value: JSONObject) {
    val pending = prepare(value) {}
    writeRecordsAtomically(pending.file, String(pending.bytes!!, Charsets.UTF_8))
  }

}

/** Implemented by the native backup transaction authority; no direct health/OS access here. */
internal interface CompanionLocalPort {
  fun requireAvailable() {}
  fun exportVaultPayload(): JSONObject
  fun mergeVaultPayload(payload: JSONObject, metadata: AtomicPrivateWrite, expectedRecordsRevision: Long, expectedPersonalRevision: Long)
  fun hostData(): JSONObject
  fun personalState(): JSONObject
  fun attachLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, commitOwner: () -> Unit)
  fun deleteLocalData()
  fun deleteAccountLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, metadata: AtomicPrivateWrite)
  fun finishAccountDeletionKeyCleanup()
  fun clearPeerPreviews() {}
}
