package com.zzzode.leanon.qa

import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.SystemClock
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.zzzode.leanon.MainActivity
import com.zzzode.leanon.companion.MigrationEntryFixture
import java.io.File
import org.json.JSONArray
import org.json.JSONObject

/** Real app services, never mocked migration state. Explicit fresh .uiqa device required. */
internal class MigrationEntryUiSession(private val instrumentation: Instrumentation, private val reset: Boolean) {
  private val context get()=instrumentation.targetContext
  private val automation get()=instrumentation.uiAutomation
  private fun find(node: AccessibilityNodeInfo?, label: String, editable: Boolean = false): AccessibilityNodeInfo? {
    if(node==null)return null
    if((!editable || node.isEditable) && (node.text?.toString()==label || node.contentDescription?.toString()==label || node.contentDescription?.toString()?.startsWith(label+" · ")==true))return node
    for(i in 0 until node.childCount)find(node.getChild(i),label,editable)?.let { return it }
    return null
  }
  private fun gesture(x: Float,y: Float,toX: Float=x,toY: Float=y) {
    val start=SystemClock.uptimeMillis()
    fun inject(action:Int,px:Float,py:Float) {val event=MotionEvent.obtain(start,SystemClock.uptimeMillis(),action,px,py,0);event.source=android.view.InputDevice.SOURCE_TOUCHSCREEN;check(automation.injectInputEvent(event,true));event.recycle()}
    inject(MotionEvent.ACTION_DOWN,x,y)
    if(x!=toX || y!=toY)for(i in 1..12){Thread.sleep(20);inject(MotionEvent.ACTION_MOVE,x+(toX-x)*i/12,y+(toY-y)*i/12)}
    inject(MotionEvent.ACTION_UP,toX,toY)
  }
  fun run() {
    check(context.packageName=="com.zzzode.leanon.uiqa")
    val directory=File(context.cacheDir,"migration-entry-ui").apply { mkdirs() }
    fun capture(name:String) {
      if(android.os.Build.VERSION.SDK_INT>=33)automation.clearCache()
      automation.takeScreenshot()?.let { bitmap -> File(directory,"$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) };bitmap.recycle() }
      val rows=JSONArray()
      fun visit(node:AccessibilityNodeInfo?) {if(node==null)return;val rect=Rect();node.getBoundsInScreen(rect)
        rows.put(JSONObject().put("text",if(node.isPassword)"[masked]" else node.text?.toString()).put("label",node.contentDescription?.toString()).put("bounds",rect.toShortString()).put("enabled",node.isEnabled).put("class",node.className?.toString()).put("actions",JSONArray(node.actionList.map {it.id})))
        for(i in 0 until node.childCount)visit(node.getChild(i))}
      visit(automation.rootInActiveWindow);File(directory,"$name.json").writeText(rows.toString(2))
      // Read the real native authority alongside pixels; no projected state is injected.
      val app=context.applicationContext as com.zzzode.leanon.LeanOnApplication
      File(directory,"$name-native-state.json").writeText(app.migration.state().toString(2))
    }
    fun launch() {instrumentation.startActivitySync(Intent(context,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK).putExtra("leanon_qa_route","settings").putExtra("leanon_qa_appearance","light").putExtra("leanon_qa_now","2026-10-07T12:00:00Z"));Thread.sleep(2000)}
    var passed=true
    try {
      if(reset)MigrationEntryFixture.seed(instrumentation)
      File(directory,"command.json").delete();launch();capture("initial")
      var last="";val deadline=SystemClock.elapsedRealtime()+30*60*1000L
      while(SystemClock.elapsedRealtime()<deadline) {
        val file=File(directory,"command.json");if(!file.exists()){Thread.sleep(100);continue}
        val command=runCatching {JSONObject(file.readText())}.getOrNull() ?: continue
        val id=command.getString("id");if(id==last){Thread.sleep(100);continue};last=id
        val action=command.getString("action");if(action=="finish")break
        check(automation.rootInActiveWindow?.packageName?.toString()==context.packageName) { "Unexpected system window; no permission operated" }
        when(action) {
          "tap" -> gesture(command.getDouble("x").toFloat(),command.getDouble("y").toFloat())
          "swipe" -> gesture(command.getDouble("x").toFloat(),command.getDouble("y").toFloat(),command.getDouble("toX").toFloat(),command.getDouble("toY").toFloat())
          "text" -> {val node=find(automation.rootInActiveWindow,command.getString("label"),true) ?: error("Missing real text field")
            val text=command.getString("text");if(!node.isFocused)check(node.performAction(AccessibilityNodeInfo.ACTION_FOCUS));instrumentation.sendStringSync(text)}
          "back" -> instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
          "launch" -> launch()
          "verify" -> File(directory,"$id-verification.json").writeText(MigrationEntryFixture.verify(context).toString(2))
          "capture" -> Unit
          else -> error("Unsupported gesture")
        }
        Thread.sleep(command.optLong("settleMs",500));capture(id)
        File(directory,"response.json").writeText(JSONObject().put("id",id).put("passed",true).toString())
      }
    } catch(error:Throwable) {passed=false;capture("failure");File(directory,"failure.json").writeText(JSONObject().put("error",error.toString()).toString())}
    instrumentation.finish(if(passed)Activity.RESULT_OK else Activity.RESULT_CANCELED,android.os.Bundle().apply {putString("migrationEntryPassed",passed.toString())})
  }
}
