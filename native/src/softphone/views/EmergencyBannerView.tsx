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
import {
  softphoneGlyphs,
  normalizeStateCode,
  type EmergencyAddressInput,
} from '@dialstack/sdk-react/core';
import type { Locale, SoftphonePalette } from '@dialstack/sdk-react/core';
import type { EmergencyAddress } from '@dialstack/sdk-webrtc';
import { Glyph, makeStyles } from '../primitives';

const EMPTY_FORM: EmergencyAddressInput = {
  address_number: '',
  street: '',
  unit: '',
  city: '',
  state: '',
  postal_code: '',
};

export interface EmergencyBannerViewProps {
  palette: SoftphonePalette;
  t: (key: keyof Locale['softphone']) => string;
  savedAddresses: EmergencyAddress[];
  submitting: boolean;
  error: string | null;
  onConfirm: (id: string) => Promise<void>;
  onCreate: (input: EmergencyAddressInput) => Promise<void>;
  locationProvider?: (() => Promise<Partial<EmergencyAddressInput>>) | null;
  defaultOpen?: boolean;
}

export function EmergencyBannerView({
  palette,
  t,
  savedAddresses,
  submitting,
  error,
  onConfirm,
  onCreate,
  locationProvider = null,
  defaultOpen = false,
}: EmergencyBannerViewProps): React.JSX.Element {
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [open, setOpen] = useState(defaultOpen);
  const [choosing, setChoosing] = useState(defaultOpen && savedAddresses.length > 0);
  const [form, setForm] = useState<EmergencyAddressInput>(EMPTY_FORM);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const openModal = () => {
    setChoosing(savedAddresses.length > 0);
    setOpen(true);
  };

  const setField = (k: keyof EmergencyAddressInput) => (value: string) =>
    setForm((f) => ({ ...f, [k]: value }));

  const closeModal = () => {
    setOpen(false);
    setLocateError(null);
    setForm(EMPTY_FORM);
  };

  const confirm = (id: string) => {
    void onConfirm(id)
      .then(closeModal)
      .catch(() => undefined);
  };

  const submit = () => {
    void onCreate({ ...form, state: normalizeStateCode(form.state), unit: form.unit || undefined })
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
                <Pressable
                  onPress={closeModal}
                  hitSlop={12}
                  accessibilityLabel={t('emergencyBack')}
                >
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
                  savedAddresses.map((a) => (
                    <Pressable
                      key={a.id}
                      disabled={submitting}
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
                  {(!!error || !!locateError) && (
                    <Text style={styles.e911Error}>{error ?? locateError}</Text>
                  )}
                  <View style={styles.e911FooterBtns}>
                    {savedAddresses.length > 0 && (
                      <Pressable
                        onPress={() => setChoosing(true)}
                        style={[styles.e911BtnSecondary, styles.e911FooterBtn]}
                      >
                        <Text style={styles.e911BtnSecondaryText}>{t('emergencyBack')}</Text>
                      </Pressable>
                    )}
                    <Pressable
                      disabled={submitting}
                      onPress={submit}
                      style={[
                        styles.e911Btn,
                        styles.e911FooterBtn,
                        submitting && styles.e911BtnDisabled,
                      ]}
                    >
                      <Text style={styles.e911BtnText}>
                        {submitting ? t('emergencySaving') : t('emergencySave')}
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
