package com.zzzode.leanon.reminders

import android.content.Context
import android.util.Log
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.zzzode.leanon.LeanOnApplication

/**
 * Fires once per day per kind (RFC 0020): applies smart silence, posts the
 * notification when the task is still undone, and re-arms from the current
 * settings (which lands on tomorrow's slot).
 */
class ReminderWorker(
  context: Context,
  params: WorkerParameters,
) : Worker(context, params) {

  override fun doWork(): Result {
    val kind = inputData.getString(ReminderScheduler.KEY_KIND)
      ?: return Result.success()
    val app = applicationContext as LeanOnApplication

    val settings = runCatching { app.settings.getReminderSettings() }.getOrElse {
      Log.w("LeanOn", "Reminder settings unavailable; notification deferred", it)
      return Result.retry()
    }
    val slot = if (kind == ReminderDecision.KIND_WEIGHT) settings.weight else settings.meals
    if (!slot.enabled) return Result.success()
    val hostData = runCatching { app.records.currentSnapshot() }.getOrElse { return Result.retry() }
    val today = hostData.getString("today")
    if (ReminderDecision.shouldNotify(kind, today, hostData)) {
      app.notifier.post(kind)
    }

    // Re-arm from current settings; the scheduler resolves the next occurrence.
    runCatching { app.reminderScheduler.scheduleKindAndAwait(kind, slot) }.getOrElse {
      Log.w("LeanOn", "Reminder re-arm failed", it)
      return Result.retry()
    }

    return Result.success()
  }
}
