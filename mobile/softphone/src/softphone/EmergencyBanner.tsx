/**
 * EmergencyBanner (RN) — the built-in "set your emergency location" (E911)
 * prompt shown above the dial pad while the session's emergency address is
 * unbound. RN parity with the web banner: non-blocking, collapsed by default,
 * expands to a saved-address confirm list + a new-address form.
 *
 * Hidden when the host manages E911, while binding is loading, or once bound.
 * Reads the E911 flow from the softphone context; owns only its expand/form state.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { softphoneGlyphs } from '@dialstack/sdk/components/softphone-icons';
import type { EmergencyAddressInput } from '@dialstack/sdk/webrtc';
import { useSoftphone } from '../SoftphoneProvider';
import { Glyph, makeStyles } from './primitives';

const EMPTY_FORM: EmergencyAddressInput = {
  address_number: '',
  street: '',
  unit: '',
  city: '',
  state: '',
  postal_code: '',
};

export function EmergencyBanner(): React.JSX.Element | null {
  const { emergency, emergencyManagedByHost, activeCall, t, palette } = useSoftphone();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [expanded, setExpanded] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [form, setForm] = useState<EmergencyAddressInput>(EMPTY_FORM);

  // Only prompt on the idle dialer — never over an active call (parity with web).
  if (emergencyManagedByHost || emergency.loading || emergency.bound || activeCall) return null;

  const setField = (k: keyof EmergencyAddressInput) => (value: string) =>
    setForm((f) => ({ ...f, [k]: value }));

  // Collapse the form ONLY on success. On failure the hook set `emergency.error`
  // (shown in the form) and rethrew, so keep the prompt open; the `.catch` no-op
  // just prevents an unhandled rejection.
  const confirm = (id: string) => {
    void emergency
      .confirm(id)
      .then(() => setExpanded(false))
      .catch(() => undefined);
  };

  const submit = () => {
    void emergency
      .create({ ...form, unit: form.unit || undefined })
      .then(() => {
        setExpanded(false);
        setAddingNew(false);
      })
      .catch(() => undefined);
  };

  const field = (key: keyof EmergencyAddressInput, label: string, opts?: { small?: boolean }) => (
    <View style={[styles.e911Field, opts?.small && styles.e911FieldSm]}>
      <Text style={styles.e911Label}>{label}</Text>
      <TextInput
        style={styles.e911Input}
        value={form[key] ?? ''}
        onChangeText={setField(key)}
        placeholderTextColor={palette.textSecondary}
        autoCorrect={false}
      />
    </View>
  );

  return (
    <View style={styles.e911}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityLabel={t('emergencyPrompt')}
        style={styles.e911Toggle}
      >
        <Glyph glyph={softphoneGlyphs.location} size={16} color={palette.warning} />
        <Text style={styles.e911ToggleText}>{t('emergencyPrompt')}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.e911Body}>
          <Text style={styles.e911Hint}>{t('emergencyHint')}</Text>

          {!addingNew &&
            emergency.savedAddresses.map((a) => (
              <Pressable
                key={a.id}
                disabled={emergency.submitting}
                onPress={() => confirm(a.id)}
                style={styles.e911Choice}
              >
                <Glyph glyph={softphoneGlyphs.location} size={16} color={palette.text} />
                <Text style={styles.e911ChoiceAddr}>
                  {[
                    a.address.address_number,
                    a.address.street,
                    a.address.city,
                    a.address.state,
                    a.address.postal_code,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                </Text>
                <Text style={styles.e911ChoiceCta}>{t('emergencyConfirm')}</Text>
              </Pressable>
            ))}

          {!addingNew && (
            <Pressable onPress={() => setAddingNew(true)} style={styles.e911BtnSecondary}>
              <Text style={styles.e911BtnSecondaryText}>{t('emergencyNewLocation')}</Text>
            </Pressable>
          )}

          {addingNew && (
            <>
              <View style={styles.e911Row}>
                {field('address_number', t('emergencyNumber'), { small: true })}
                {field('street', t('emergencyStreet'))}
              </View>
              {field('unit', t('emergencyUnit'))}
              {field('city', t('emergencyCity'))}
              <View style={styles.e911Row}>
                {field('state', t('emergencyState'))}
                {field('postal_code', t('emergencyPostalCode'), { small: true })}
              </View>
              {!!emergency.error && <Text style={styles.e911Error}>{emergency.error}</Text>}
              <View style={styles.e911Actions}>
                {emergency.savedAddresses.length > 0 && (
                  <Pressable onPress={() => setAddingNew(false)} style={styles.e911BtnSecondary}>
                    <Text style={styles.e911BtnSecondaryText}>{t('emergencyBack')}</Text>
                  </Pressable>
                )}
                <Pressable disabled={emergency.submitting} onPress={submit} style={styles.e911Btn}>
                  <Text style={styles.e911BtnText}>
                    {emergency.submitting ? t('emergencySaving') : t('emergencySave')}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}
