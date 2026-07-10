// Error reporting for the WebRTC core. We deliberately log ONLY errors, and
// always (no opt-in flag): a failed connect / call / send is something a
// developer needs to see in the console without turning anything on, while
// success-path chatter would just be noise. Uses only `console`, so it is safe
// on React Native as well as the web.

/**
 * Log a softphone error to the console, tagged `[dialstack]`. `data` is an
 * optional structured context object (codes, ids) passed as a second console
 * argument so it stays inspectable.
 */
export function logError(message: string, data?: unknown): void {
  const sink = console.error ?? console.log;
  if (!sink) return;
  const line = `[dialstack] ${message}`;
  if (data === undefined) sink(line);
  else sink(line, data);
}
