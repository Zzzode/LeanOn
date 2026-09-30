package com.zzzode.leanon.bridge

import android.content.Context
import com.lynx.tasm.LynxEnv
import com.zzzode.leanon.modules.AppModule
import com.zzzode.leanon.modules.HealthModule
import com.zzzode.leanon.modules.NotificationModule
import com.zzzode.leanon.modules.ResourceModule
import com.zzzode.leanon.modules.ScaleModule
import com.zzzode.leanon.modules.StorageModule

/** Registers the Lynx native modules once, before any container loads a page. */
object LynxModuleBootstrap {

  fun initialize(context: Context) {
    // One-time LynxEnv initialization (bundle loader / init data) is version
    // specific; perform it here before module registration.
    val env = LynxEnv.inst()
    // Exported module names match the capability domains; methods match actions.
    env.registerModule("health", HealthModule::class.java)
    env.registerModule("scale", ScaleModule::class.java)
    env.registerModule("storage", StorageModule::class.java)
    env.registerModule("resource", ResourceModule::class.java)
    env.registerModule("app", AppModule::class.java)
    env.registerModule("notification", NotificationModule::class.java)
  }
}
