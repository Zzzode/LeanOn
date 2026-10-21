package com.zzzode.leanon.reminders

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.zzzode.leanon.LeanOnApplication

/** Durable reconciliation runs outside the broadcast's limited execution window. */
class ReminderClockWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {
  override fun doWork(): Result = try {
    val app = applicationContext as LeanOnApplication
    app.reminderScheduler.applySettingsAndAwait(app.settings.getReminderSettings())
    Result.success()
  } catch (_: Exception) { Result.retry() }
}
