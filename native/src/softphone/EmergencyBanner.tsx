/**
 * EmergencyBanner (RN) — the built-in "set your emergency location" (E911)
 * prompt shown above the dial pad while the session's emergency address is
 * unbound. A compact banner opens a mobile Modal form (the web's cramped inline
 * two-column layout is unusable on a phone under the keyboard).
 *
 * Hidden when the host manages E911, while binding is loading, or once bound.
 * Reads the E911 flow from the softphone context; owns only its modal/form state.
 *
 * If the host passed a `locationProvider`, the form offers "Use my current
 * location" to prefill the address (the host owns the permission + geolocation +
 * reverse-geocode; the SDK takes no geolocation dependency).
 */

import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
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
  const { emergency, emergencyManagedByHost, activeCall, locationProvider, t, palette } =
    useSoftphone();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [open, setOpen] = useState(false);
  // The saved-address chooser is only a step when there ARE saved addresses;
  // otherwise (the common case) the modal opens straight into the new-address
  // form. `null` = not yet resolved for this open; set on open from savedAddresses.
  const [choosing, setChoosing] = useState(false);
  const [form, setForm] = useState<EmergencyAddressInput>(EMPTY_FORM);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // Only prompt on the idle dialer — never over an active call (parity with web).
  if (emergencyManagedByHost || emergency.loading || emergency.bound || activeCall) return null;

  const openModal = () => {
    // Show the saved-address picker first only if there's something to pick.
    setChoosing(emergency.savedAddresses.length > 0);
    setOpen(true);
  };

  const setField = (k: keyof EmergencyAddressInput) => (value: string) =>
    setForm((f) => ({ ...f, [k]: value }));

  const closeModal = () => {
    setOpen(false);
    setLocateError(null);
    // Reset the form so a dismissed-then-reopened modal starts clean — the
    // banner stays mounted while unbound, so `form` would otherwise persist
    // stale input across opens (and re-typing would append to it).
    setForm(EMPTY_FORM);
  };

  const confirm = (id: string) => {
    void emergency
      .confirm(id)
      .then(closeModal)
      .catch(() => undefined);
  };

  const submit = () => {
    void emergency
      .create({ ...form, unit: form.unit || undefined })
      .then(closeModal)
      .catch(() => undefined);
  };

  const useMyLocation = () => {
    if (!locationProvider) return;
    setLocateError(null);
    setLocating(true);
    void locationProvider()
      .then((addr) => setForm((f) => ({ ...f, ...addr })))
      .catch((e: unknown) =>
        setLocateError(e instanceof Error ? e.message : t('emergencyLocating'))
      )
      .finally(() => setLocating(false));
  };

  const field = (key: keyof EmergencyAddressInput, label: string) => (
    <View style={styles.e911Field}>
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
        onPress={openModal}
        accessibilityLabel={t('emergencyPrompt')}
        style={styles.e911Toggle}
      >
        <Glyph glyph={softphoneGlyphs.location} size={16} color={palette.warning} />
        <Text style={styles.e911ToggleText}>{t('emergencyPrompt')}</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={closeModal}>
        <View style={styles.e911Backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.e911ModalWrap}
          >
            <View style={styles.e911Sheet}>
              <View style={styles.e911Header}>
                <Text style={styles.e911Title}>{t('emergencyPrompt')}</Text>
                <Pressable onPress={closeModal} hitSlop={12} accessibilityLabel={t('emergencyBack')}>
                  <Text style={styles.e911Close}>✕</Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.e911Scroll}
                contentContainerStyle={styles.e911ScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.e911Hint}>{t('emergencyHint')}</Text>

                {choosing &&
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

                {choosing && (
                  <Pressable onPress={() => setChoosing(false)} style={styles.e911BtnSecondary}>
                    <Text style={styles.e911BtnSecondaryText}>{t('emergencyNewLocation')}</Text>
                  </Pressable>
                )}

                {!choosing && (
                  <>
                    {!!locationProvider && (
                      <Pressable
                        disabled={locating}
                        onPress={useMyLocation}
                        style={[styles.e911LocateBtn, locating && styles.e911BtnDisabled]}
                      >
                        <Glyph glyph={softphoneGlyphs.location} size={16} color={palette.accent} />
                        <Text style={styles.e911LocateBtnText}>
                          {locating ? t('emergencyLocating') : t('emergencyUseLocation')}
                        </Text>
                      </Pressable>
                    )}

                    {field('address_number', t('emergencyNumber'))}
                    {field('street', t('emergencyStreet'))}
                    {field('unit', t('emergencyUnit'))}
                    {field('city', t('emergencyCity'))}
                    {field('state', t('emergencyState'))}
                    {field('postal_code', t('emergencyPostalCode'))}
                  </>
                )}
              </ScrollView>

              {!choosing && (
                <View style={styles.e911Footer}>
                  {(!!emergency.error || !!locateError) && (
                    <Text style={styles.e911Error}>{emergency.error ?? locateError}</Text>
                  )}
                  <View style={styles.e911FooterBtns}>
                  {emergency.savedAddresses.length > 0 && (
                    <Pressable
                      onPress={() => setChoosing(true)}
                      style={[styles.e911BtnSecondary, styles.e911FooterBtn]}
                    >
                      <Text style={styles.e911BtnSecondaryText}>{t('emergencyBack')}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    disabled={emergency.submitting}
                    onPress={submit}
                    style={[styles.e911Btn, styles.e911FooterBtn, emergency.submitting && styles.e911BtnDisabled]}
                  >
                    <Text style={styles.e911BtnText}>
                      {emergency.submitting ? t('emergencySaving') : t('emergencySave')}
                    </Text>
                  </Pressable>
                  </View>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}
