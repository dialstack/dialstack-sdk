import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatForDisplay } from '../phone';
import type { CallRecord } from '../rig';
import { card, colors } from '../theme';

interface Props {
  call: CallRecord;
  /** The user's cell, which rings first. */
  mobile: string | null;
  onDismiss: () => void;
}

const ENDED_STATUS: Record<string, string> = {
  completed: 'Call ended',
  'no-answer': 'No answer',
  busy: 'Busy',
  failed: 'Call failed',
};

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function CallStatusCard({ call, mobile, onDismiss }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (call.phase !== 'connected') return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [call.phase]);

  const to = formatForDisplay(call.to);
  let title: string;
  let detail: string;
  switch (call.phase) {
    case 'calling_you':
      title = 'Calling your phone…';
      detail = mobile ? `Answer ${formatForDisplay(mobile)} to reach ${to}.` : `To reach ${to}.`;
      break;
    case 'dialing':
      title = `Dialing ${to}…`;
      detail = 'You picked up. Connecting you now.';
      break;
    case 'connected':
      title = `Connected to ${to}`;
      detail = call.connectedAt
        ? formatDuration((now - Date.parse(call.connectedAt)) / 1000)
        : 'On the call';
      break;
    case 'ended':
      title = ENDED_STATUS[call.status ?? ''] ?? 'Call ended';
      detail =
        call.connectedAt && call.durationSeconds
          ? `${to} · ${formatDuration(call.durationSeconds)}`
          : to;
      break;
    case 'not_answered':
      title = 'You didn’t answer';
      detail = `The call to ${to} was not placed.`;
      break;
  }
  const done = call.phase === 'ended' || call.phase === 'not_answered';

  return (
    <View style={[styles.card, !done && styles.live]}>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      {done ? (
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Text style={styles.dismiss}>Dismiss</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...card, flexDirection: 'row', alignItems: 'center', gap: 12 },
  live: { borderColor: colors.primary },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  detail: { fontSize: 14, color: colors.muted },
  dismiss: { color: colors.primary, fontWeight: '600' },
});
