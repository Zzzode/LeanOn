package com.zzzode.leanon.reminders

/** The caller serializes updates; a failed schedule never acknowledges success. */
internal fun updateReminderSettingsDurably(
  settings: ReminderSettings,
  read: () -> ReminderSettings,
  persist: (ReminderSettings) -> Unit,
  scheduleAndAwait: (ReminderSettings) -> Unit,
): ReminderSettings {
  val previous = read()
  persist(settings)
  try {
    scheduleAndAwait(settings)
  } catch (failure: Exception) {
    runCatching { persist(previous) }.onFailure { failure.addSuppressed(it) }
    runCatching { scheduleAndAwait(previous) }.onFailure { failure.addSuppressed(it) }
    throw failure
  }
  return settings
}
