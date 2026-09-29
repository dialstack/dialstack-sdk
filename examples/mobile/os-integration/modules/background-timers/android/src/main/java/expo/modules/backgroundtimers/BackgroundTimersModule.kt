package expo.modules.backgroundtimers

import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Timers on the main looper, reported to JS as an event. React Native drives
 * JS timers from display frames, which stop in a backgrounded app; the main
 * looper and event delivery keep running.
 */
class BackgroundTimersModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private val pending = HashMap<Int, Runnable>()

  override fun definition() = ModuleDefinition {
    Name("BackgroundTimers")
    Events("onFire")

    Function("start") { id: Int, delayMs: Double ->
      val fire = Runnable {
        synchronized(pending) { pending.remove(id) }
        sendEvent("onFire", mapOf("id" to id))
      }
      synchronized(pending) { pending[id] = fire }
      handler.postDelayed(fire, delayMs.toLong())
    }

    Function("cancel") { id: Int ->
      synchronized(pending) { pending.remove(id) }?.let { handler.removeCallbacks(it) }
    }

    OnDestroy {
      synchronized(pending) {
        pending.values.forEach { handler.removeCallbacks(it) }
        pending.clear()
      }
    }
  }
}
