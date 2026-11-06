import { AsYouType } from 'libphonenumber-js';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { clock, endedText, failureText } from '../callText';
import { matchContact, type Contact } from '../contacts';
import { formatForDisplay, toE164 } from '../phone';
import { isFinished, type CallRecord, type CallVerb } from '../rig';
import { colors } from '../theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

interface Props {
  /** The user's cell, which rings first. */
  mobile: string;
  /** The call placed from this app, or null. */
  call: CallRecord | null;
  /** An E.164 number, or the digits as typed (an extension, say). */
  onCall: (destination: string) => void;
  onControl: (verb: CallVerb) => void;
  /** Leaves the call screen for the keypad. */
  onClose: () => void;
}

/**
 * The phone screen: a dial pad until a call is placed, then that call. Audio is
 * on the user's cell, so mute and the speaker live on its own call screen; here
 * are the things the backend can do: hold, resume and end, once the call has
 * an id to act on.
 */
export function Dialer({ mobile, call, onCall, onControl, onClose }: Props) {
  const [digits, setDigits] = useState('');

  if (call) return <CallView call={call} mobile={mobile} onControl={onControl} onClose={onClose} />;

  // A full phone number goes out as E.164; anything else, such as an
  // extension like 1001, goes out as typed. DialStack decides which it is.
  const destination = toE164(digits) ?? digits;
  const canCall = digits.length > 0;

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Text style={[styles.number, !digits && styles.placeholder]} numberOfLines={1}>
          {digits ? new AsYouType('US').input(digits) : 'Enter a number'}
        </Text>
        {digits ? (
          <Pressable
            accessibilityLabel="Delete"
            hitSlop={12}
            onPress={() => setDigits((d) => d.slice(0, -1))}
          >
            <Text style={styles.backspace}>⌫</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.grid}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            onPress={() => setDigits((d) => d + k)}
            style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
          >
            <Text style={styles.digit}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.bottom}>
        <Pressable
          accessibilityLabel="Call"
          disabled={!canCall}
          onPress={() => {
            onCall(destination);
            setDigits('');
          }}
          style={[styles.button, styles.call, !canCall && styles.disabled]}
        >
          <Text style={styles.buttonText}>Call</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CallView({
  call,
  mobile,
  onControl,
  onClose,
}: {
  call: CallRecord;
  mobile: string;
  onControl: (verb: CallVerb) => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (call.phase !== 'connected') return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [call.phase]);

  const to = formatForDisplay(call.to);
  // Who the call is with, from the app's own records.
  const patient = matchContact(call.to);
  const busy = !!call.pending;
  const done = isFinished(call);

  let status: string;
  if (call.pending === 'hangup') status = 'Ending…';
  else if (call.pending === 'hold') status = 'Holding…';
  else if (call.pending === 'unhold') status = 'Resuming…';
  else if (call.phase === 'calling_you')
    // No call id until the user answers, so nothing can cancel it from here.
    status = `Calling your phone, ${formatForDisplay(mobile)}. Answer to be connected, or decline to cancel.`;
  else if (call.phase === 'dialing') status = 'You picked up · dialing…';
  else if (call.phase === 'connected')
    status = call.held
      ? 'On hold'
      : call.connectedAt
        ? clock((now - Date.parse(call.connectedAt)) / 1000)
        : 'Connected';
  // Nothing reports why: the user may not have answered, or the destination
  // may not have been dialable.
  else if (call.phase === 'not_answered') status = 'The call wasn’t connected.';
  else status = endedText(call);

  return (
    <View style={styles.screen}>
      <View style={styles.peer}>
        <Text style={styles.name}>{patient?.name ?? to}</Text>
        <Text style={[styles.status, call.held && styles.held]}>{status}</Text>
        {call.error && !done ? <Text style={styles.error}>{failureText(call.error)}</Text> : null}
      </View>
      <PatientCard patient={patient} number={to} />
      <View style={styles.bottom}>
        {call.phase === 'connected' ? (
          <Pressable
            disabled={busy}
            onPress={() => onControl(call.held ? 'unhold' : 'hold')}
            style={[styles.button, styles.secondary, busy && styles.disabled]}
          >
            <Text style={styles.secondaryText}>{call.held ? 'Resume' : 'Hold'}</Text>
          </Pressable>
        ) : null}
        {call.phase === 'dialing' || call.phase === 'connected' ? (
          <Pressable
            disabled={busy}
            onPress={() => onControl('hangup')}
            style={[styles.button, styles.end, busy && styles.disabled]}
          >
            <Text style={styles.buttonText}>End</Text>
          </Pressable>
        ) : null}
        {call.phase === 'calling_you' ? (
          // The call has no id yet, so this only leaves the screen; the phone
          // stops ringing when the user declines or the profile times out.
          <Pressable onPress={onClose} style={[styles.button, styles.secondary]}>
            <Text style={styles.secondaryText}>Close</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** What the app knows about who is on the call, as a CRM's call screen would show it. */
function PatientCard({ patient, number }: { patient: Contact | null; number: string }) {
  if (!patient) {
    return (
      <View style={[styles.card, styles.cardEmpty]}>
        <Text style={styles.cardMuted}>No matching patient for {number}</Text>
      </View>
    );
  }
  const rows: [string, string][] = [
    ['Reason', patient.detail],
    ['Date of birth', patient.dateOfBirth],
    ['Email', patient.email],
    ['Patient since', patient.patientSince],
    ['Next visit', patient.nextVisit ?? 'None booked'],
  ];
  return (
    <View style={styles.card}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.cardRow}>
          <Text style={styles.cardMuted}>{label}</Text>
          <Text style={styles.cardValue} numberOfLines={1}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const KEY = 76;
const WIDTH = KEY * 3 + 20 * 2;

const styles = StyleSheet.create({
  // Fills whatever it is given: what is dialed at the top, the action at the bottom.
  screen: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  number: { fontSize: 32, fontWeight: '500', color: colors.text },
  placeholder: { color: colors.muted },
  backspace: { fontSize: 24, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: WIDTH, columnGap: 20, rowGap: 16 },
  key: {
    width: KEY,
    height: KEY,
    borderRadius: KEY / 2,
    backgroundColor: colors.key,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: colors.border },
  digit: { fontSize: 30, fontWeight: '500', color: colors.text },
  peer: { alignItems: 'center', gap: 10, marginTop: 48, paddingHorizontal: 16 },
  name: { fontSize: 32, fontWeight: '600', color: colors.text, textAlign: 'center' },
  card: {
    width: WIDTH + 40,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  cardEmpty: { paddingVertical: 16, alignItems: 'center', borderStyle: 'dashed' },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cardMuted: { color: colors.muted },
  cardValue: { flexShrink: 1, textAlign: 'right', fontWeight: '600', color: colors.text },
  status: { fontSize: 17, color: colors.muted, textAlign: 'center', fontVariant: ['tabular-nums'] },
  held: { color: colors.primary },
  error: { color: colors.danger, textAlign: 'center' },
  bottom: { width: WIDTH, gap: 12, alignItems: 'center' },
  button: { alignSelf: 'stretch', paddingVertical: 16, borderRadius: 999, alignItems: 'center' },
  call: { backgroundColor: colors.success },
  end: { backgroundColor: colors.danger },
  secondary: { backgroundColor: colors.key },
  buttonText: { color: colors.primaryText, fontSize: 17, fontWeight: '600' },
  secondaryText: { color: colors.text, fontSize: 17, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
