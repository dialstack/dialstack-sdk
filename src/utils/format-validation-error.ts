/** Map API validation error fields to human-readable messages. */
const validationMessages: Record<string, string> = {
  schedule_id: 'A schedule must be selected in the Schedule node',
  target_id: 'A target must be selected in the Dial node',
};

const nodeTypeLabels: Record<string, string> = {
  schedule: 'Schedule',
  internal_dial: 'Dial',
  ring_all_users: 'Ring All',
};

/**
 * Formats a raw API validation error string into a human-readable message.
 *
 * API errors use JSON path prefixes like "/nodes/3/config/schedule_id: minLength: got 0, want 1".
 * This function parses the path and returns a user-friendly message.
 */
export function formatValidationError(
  apiError: string,
  payloadNodes?: Array<{ type: string }>
): string {
  // Split JSON path from message: "/nodes/3/config/schedule_id: minLength ..." → [path, message]
  const colonIdx = apiError.indexOf(': ');
  const path = colonIdx > 0 && apiError.startsWith('/') ? apiError.slice(0, colonIdx) : '';
  const message = colonIdx > 0 ? apiError.slice(colonIdx + 2) : apiError;
  const segments = path.split('/').filter(Boolean);

  // /entry_node — Start node has no connection
  if (segments[0] === 'entry_node') {
    return 'The Start node must be connected to another node';
  }

  // /nodes with minItems — empty nodes array
  if (segments[0] === 'nodes' && message.includes('minItems')) {
    return 'The dial plan must have at least one node';
  }

  // /nodes/{index}/config/{field} — node config validation
  if (segments[0] === 'nodes' && segments[2] === 'config' && segments[3]) {
    const field = segments[3];
    if (validationMessages[field]) return validationMessages[field] as string;

    const nodeIndex = parseInt(segments[1] ?? '', 10);
    const nodeType = !isNaN(nodeIndex) ? payloadNodes?.[nodeIndex]?.type : undefined;
    const label = nodeType ? (nodeTypeLabels[nodeType] ?? nodeType) : undefined;
    return label
      ? `Invalid ${field.replace(/_/g, ' ')} in the ${label} node`
      : `Invalid ${field.replace(/_/g, ' ')}`;
  }

  // Fallback: show the message part without the JSON path
  return path ? message : apiError;
}
