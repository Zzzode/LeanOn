package com.zzzode.leanon.personal

import java.io.File

internal fun qaBackupOverrideAllowed(debug: Boolean, packageName: String, cache: File, fixture: File): Boolean =
  debug && packageName.endsWith(".uiqa") && fixture.name in setOf("personal-ui", "companion-ui", "a11y-ui") &&
    fixture.canonicalPath.startsWith(cache.canonicalPath + File.separator)
