/** Arguments an agent's `transfer_to_human` tool call carried, as an object. */
export type ToolArgs = Record<string, unknown>;

/**
 * A transfer refused before any DialStack call. Its message is meant for the
 * agent: it says which extensions it may offer the caller instead.
 */
export class TransferRefused extends Error {}

/** What the agent is told when a transfer fails, so it can act on a refusal. */
export function agentTransferError(err: Error): string {
  return err instanceof TransferRefused
    ? err.message
    : 'The transfer could not be placed. Apologise and keep helping the caller.';
}

/**
 * Tool-call arguments as an object. Telnyx sends a JSON string, ElevenLabs an
 * object; anything else, or JSON that is not an object, is no arguments.
 */
export function parseToolArgs(raw: unknown): ToolArgs {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as ToolArgs) : {};
}

/** `TRANSFER_EXTENSIONS` (`1001:Sales,1002:Support`) as extension → name. */
function allowList(raw: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const entry of (raw ?? '').split(',')) {
    const [ext, name = ''] = entry.split(':').map((s) => s.trim());
    if (ext) out.set(ext, name);
  }
  return out;
}

/**
 * Where to transfer the caller. An `extension` the agent names must be in
 * `TRANSFER_EXTENSIONS`: the agent repeats what the caller says, so with no
 * allow-list a named extension is refused. A blank or null `extension` (how
 * models often fill an optional parameter) counts as none named, and then
 * `TRANSFER_TARGET` is used.
 */
export function resolveTransferTarget(
  args: ToolArgs,
  env: Record<string, string | undefined>
): { target: string } | { error: Error } {
  const named = typeof args.extension === 'string' ? args.extension.trim() : args.extension;
  if (named !== undefined && named !== null && named !== '') {
    const allowed = allowList(env.TRANSFER_EXTENSIONS);
    if (typeof named === 'string' && allowed.has(named)) {
      return { target: named };
    }
    const offer = [...allowed].map(([ext, name]) => (name ? `${ext} (${name})` : ext)).join(', ');
    return {
      error: new TransferRefused(
        offer
          ? `That extension can't be reached. Ask the caller which they want: ${offer}.`
          : 'Transfers to a named extension are not available. Keep helping the caller.'
      ),
    };
  }
  if (env.TRANSFER_TARGET) {
    return { target: env.TRANSFER_TARGET };
  }
  return { error: new Error('TRANSFER_TARGET is not set') };
}
