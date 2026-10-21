package com.zzzode.leanon.healthconnect

import java.io.IOException

/** Provider work may finish late, but may not recreate data after explicit local deletion. */
internal class HealthSyncCommitGate {
  private var generation = 0L
  @Synchronized fun current(): Long = generation
  @Synchronized fun <T> commit(expected: Long, action: () -> T): T {
    if (generation != expected) throw IOException("Health sync invalidated by local deletion")
    return action()
  }
  @Synchronized fun <T> invalidate(action: () -> T): T { generation++; return action() }
}

internal fun performLocalHealthDataDeletion(
  settings: com.zzzode.leanon.data.SettingsRepository,
  gate: HealthSyncCommitGate,
  cancelPending: () -> Unit,
  delete: () -> Unit,
) = gate.invalidate {
  cancelPending()
  settings.setHealthConnectEnabled(false)
  settings.setLastSyncEpochMs(0)
  delete()
}
