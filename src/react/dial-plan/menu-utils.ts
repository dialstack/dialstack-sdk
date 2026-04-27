/** Map a DTMF digit to a React Flow handle ID. */
export function digitToHandleId(digit: string): string {
  if (digit === '*') return 'digit_star';
  if (digit === '#') return 'digit_hash';
  return `digit_${digit}`;
}

/** Map a React Flow handle ID back to a DTMF digit, or undefined if not a digit handle. */
export function handleIdToDigit(handleId: string): string | undefined {
  if (handleId === 'digit_star') return '*';
  if (handleId === 'digit_hash') return '#';
  const match = handleId.match(/^digit_(\d)$/);
  return match?.[1];
}
