/**
 * "Keep this JS runtime alive" as a promise the platform can await.
 *
 * Android's HeadlessJsTaskService tears the runtime down the moment the task
 * promise settles, so a wake holds this from the instant the task starts until
 * live calls hit zero. What the hold actually covers is the gap before the call
 * library's foreground service exists — once that is up it holds the process,
 * and a ceiling reached mid-call ends only this task, not the call (measured: a
 * 60s ring survived the then-45s ceiling untouched).
 *
 * So the ceiling is a bound on a wake that never delivers, not a correctness
 * guarantee. It is set to the same 300s as the max park/ring, the service's task
 * timeout, the OS answer deadline and the library's incoming-call timeout purely
 * so the numbers don't contradict each other; keep them aligned.
 */
export class RuntimeHold {
  private release: (() => void) | null = null;
  private waiting: Promise<void> | null = null;

  constructor(private readonly ceilingMs = 300_000) {}

  acquire(): Promise<void> {
    if (this.waiting) return this.waiting;
    this.waiting = new Promise<void>((resolve) => {
      const timer = setTimeout(() => this.settle(resolve), this.ceilingMs);
      this.release = () => {
        clearTimeout(timer);
        this.settle(resolve);
      };
    });
    return this.waiting;
  }

  releaseNow(): void {
    this.release?.();
  }

  /** Non-null while a hold is in flight — the reliable "a wake is mid-flight" signal. */
  pending(): Promise<void> | null {
    return this.waiting;
  }

  private settle(resolve: () => void): void {
    this.release = null;
    this.waiting = null;
    resolve();
  }
}
