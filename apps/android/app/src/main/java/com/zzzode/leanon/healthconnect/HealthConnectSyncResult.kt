package com.zzzode.leanon.healthconnect

/** Only a successful export permits a complete-sync timestamp. */
internal suspend fun completeHealthConnectSync(
  importMirrors: suspend () -> Unit,
  exportRecords: suspend () -> Boolean,
  stampSuccess: () -> Unit,
): Boolean {
  importMirrors()
  if (!exportRecords()) return false
  stampSuccess()
  return true
}
