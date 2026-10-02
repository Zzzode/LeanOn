package com.zzzode.leanon.reminders

import android.content.Context
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

    val hostData = app.records.loadHostData()
    val today = hostData.getString("today")
    if (ReminderDecision.shouldNotify(kind, today, hostData)) {
      app.notifier.post(kind)
    }

    // Re-arm from current settings; the scheduler resolves the next occurrence.
    val settings = app.settings.getReminderSettings()
    val slot =
      if (kind == ReminderDecision.KIND_WEIGHT) settings.weight else settings.meals
    app.reminderScheduler.scheduleKind(kind, slot)

    return Result.success()
  }
}
