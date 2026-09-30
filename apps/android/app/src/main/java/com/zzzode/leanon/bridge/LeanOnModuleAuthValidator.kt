package com.zzzode.leanon.bridge

/**
 * Least-privilege gate for native module calls. Register an adapter to this
 * logic with LynxViewBuilder.registerModuleAuthValidator before loading a page.
 */
class LeanOnModuleAuthValidator(
  private val capabilities: CapabilityRegistry,
) {
  fun verify(module: String, method: String, params: Any?): Boolean {
    return capabilities.supportsMethod("$module.$method")
  }
}
