package com.zzzode.leanon.companion

import android.content.Context
import android.content.ContextWrapper
import com.zzzode.leanon.data.RecordsRepository
import com.zzzode.leanon.personal.*
import org.json.JSONObject
import java.io.File

/** Separate encrypted collection; the source remains usable until transactional activation. */
internal class CompanionMigrationCollection(base: Context) {
  private val directory = File(base.filesDir, "cloudflare-migration-target").apply { mkdirs() }
  val context = object : ContextWrapper(base) {
    override fun getFilesDir() = directory
    override fun getCacheDir() = File(directory, "cache").apply { mkdirs() }
    override fun getPackageName() = base.packageName + ".migration-target"
    override fun getApplicationContext(): Context = this
  }
  val records = RecordsRepository(context)
  val personal = PersonalRepository(context)
  private val keys = PersonalKeyStore(context, File(directory,"transactions"),"migration-transactions")
  val backup = BackupCoordinator({ records }, { personal }, PrivateTransactionJournal(File(directory,"transactions"), keys::key, { it.canonicalPath.startsWith(directory.canonicalPath + File.separator) }))
  val store: CompanionStore = SecureCompanionStore(context)
  private val port = object : CompanionLocalPort {
    override fun requireAvailable() = backup.requireAvailable()
    override fun exportVaultPayload() = backup.exportPayload()
    override fun hostData() = records.currentSnapshot()
    override fun personalState() = personal.snapshot()
    override fun mergeVaultPayload(payload: JSONObject, metadata: AtomicPrivateWrite, expectedRecordsRevision: Long, expectedPersonalRevision: Long) = backup.mergeVaultPayload(payload, metadata, expectedRecordsRevision, expectedPersonalRevision)
    override fun attachLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, commitOwner: () -> Unit) = backup.attach(expectedRecordsRevision, expectedPersonalRevision, commitOwner)
    override fun deleteLocalData() = backup.deleteLocalData()
    override fun deleteAccountLocalData(expectedRecordsRevision: Long, expectedPersonalRevision: Long, metadata: AtomicPrivateWrite) = backup.deleteAccountLocalData(expectedRecordsRevision, expectedPersonalRevision, metadata)
    override fun finishAccountDeletionKeyCleanup() = backup.finishDeletionKeyCleanup()
  }
  init { backup.recover(); records.availabilityCheck = backup::requireAvailable; personal.availabilityCheck = backup::requireAvailable }
  fun service() = CompanionRepository(store, port, System::currentTimeMillis)
}
