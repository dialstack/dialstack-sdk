import ExpoModulesCore

/// Timers on a dispatch queue, reported to JS as an event, so they fire on the
/// same terms on both platforms rather than on React Native's JS timers.
public class BackgroundTimersModule: Module {
  private let queue = DispatchQueue(label: "ai.dialstack.background-timers")
  private var pending: [Int: DispatchWorkItem] = [:]

  public func definition() -> ModuleDefinition {
    Name("BackgroundTimers")
    Events("onFire")

    Function("start") { (id: Int, delayMs: Double) in
      let fire = DispatchWorkItem { [weak self] in
        guard let self else { return }
        self.pending[id] = nil
        self.sendEvent("onFire", ["id": id])
      }
      self.queue.async {
        self.pending[id] = fire
        self.queue.asyncAfter(deadline: .now() + .milliseconds(Int(delayMs)), execute: fire)
      }
    }

    Function("cancel") { (id: Int) in
      self.queue.async { self.pending.removeValue(forKey: id)?.cancel() }
    }

    OnDestroy {
      self.queue.sync {
        self.pending.values.forEach { $0.cancel() }
        self.pending.removeAll()
      }
    }
  }
}
