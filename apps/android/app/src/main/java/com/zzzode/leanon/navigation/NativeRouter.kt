package com.zzzode.leanon.navigation

import androidx.navigation.NavController

/**
 * Bridges Lynx `app.openRoute` calls to Jetpack Navigation. The activity
 * attaches its NavController at start. Unknown routes have no destination and
 * are ignored, matching the iOS shell.
 */
class NativeRouter {

  private var navController: NavController? = null

  fun attach(navController: NavController) {
    this.navController = navController
  }

  fun detach() {
    navController = null
  }

  /** Returns true when navigation to the route succeeded. */
  fun open(route: String): Boolean {
    val controller = navController ?: return false
    return try {
      controller.navigate(route)
      true
    } catch (e: IllegalArgumentException) {
      false
    }
  }
}
