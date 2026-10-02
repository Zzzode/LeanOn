package com.zzzode.leanon.reminders

import android.content.Context
import androidx.work.ExistingWorkPolicy.REPLACE
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.Calendar
import java.util.concurrent.TimeUnit

/**
 * Schedules daily reminders with WorkManager (RFC 0020).
 *
 * Each kind is a unique one-time work with an initial delay to the next local
 * occurrence. After firing, ReminderWorker re-arms from the current settings,
 * so the fire time stays anchored (no drift accumulation) while WorkManager
 * still handles Doze, reboot persistence and deferral. No exact-alarm
 * permission is required.
 */
class ReminderScheduler(context: Context) {

  private val workManager = WorkManager.getInstance(context)

  /** Reconcile both kinds with the persisted settings. */
  fun applySettings(settings: ReminderSettings) {
    scheduleKind(ReminderDecision.KIND_WEIGHT, settings.weight)
    scheduleKind(ReminderDecision.KIND_MEALS, settings.meals)
  }

  /** Create, replace, or cancel the unique work for one kind. */
  fun scheduleKind(kind: String, slot: ReminderSlot) {
    if (!slot.enabled) {
      workManager.cancelUniqueWork(workName(kind))
      return
    }
    val request = OneTimeWorkRequestBuilder<ReminderWorker>()
      .setInitialDelay(delayToNext(slot.hour, slot.minute, Calendar.getInstance()), TimeUnit.MILLISECONDS)
      .setInputData(workDataOf(KEY_KIND to kind))
      .build()
    workManager.enqueueUniqueWork(workName(kind), REPLACE, request)
  }

  companion object {
    const val KEY_KIND = "kind"

    fun workName(kind: String): String = "reminder-$kind"

    /**
     * Milliseconds from [now] to the next occurrence of [hour]:[minute]; if
     * today's slot has passed, the result lands on tomorrow.
     */
    fun delayToNext(hour: Int, minute: Int, now: Calendar): Long {
      val target = (now.clone() as Calendar).apply {
        set(Calendar.HOUR_OF_DAY, hour)
        set(Calendar.MINUTE, minute)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
      }
      if (target.timeInMillis <= now.timeInMillis) {
        target.add(Calendar.DAY_OF_YEAR, 1)
      }
      return target.timeInMillis - now.timeInMillis
    }
  }
}
