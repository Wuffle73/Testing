import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { RootStackScreenProps } from '../navigation/types';
import {
  clearApiKey,
  getMockMode,
  getModel,
  hasEnvKey,
  MODEL_OPTIONS,
  setApiKey,
  setMockMode,
  setModel,
} from '../ai/config';
import { getApiKey } from '../ai/config';
import { colors, spacing, radius, fontSize, shadow } from '../theme/theme';
import { Button } from '../components/Button';

export function SettingsScreen({ navigation }: RootStackScreenProps<'Settings'>) {
  const envKey = hasEnvKey();
  const [loading, setLoading] = useState(true);
  const [mock, setMock] = useState(true);
  const [model, setModelState] = useState<string>(MODEL_OPTIONS[2].id);
  const [keyInput, setKeyInput] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);

  useEffect(() => {
    (async () => {
      const [m, mdl, key] = await Promise.all([getMockMode(), getModel(), getApiKey()]);
      setMock(m);
      setModelState(mdl);
      setHasStoredKey(!!key);
      setLoading(false);
    })();
  }, []);

  const onToggleMock = async (value: boolean) => {
    setMock(value);
    await setMockMode(value);
  };

  const onPickModel = async (id: string) => {
    setModelState(id);
    await setModel(id);
  };

  const onSaveKey = async () => {
    if (!keyInput.trim()) return;
    await setApiKey(keyInput);
    setKeyInput('');
    setHasStoredKey(true);
    Alert.alert('Saved', 'Your API key is stored securely on this device.');
  };

  const onClearKey = async () => {
    await clearApiKey();
    setHasStoredKey(false);
    Alert.alert('Cleared', 'The stored API key was removed from this device.');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {/* Mock vs live */}
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.title}>Mock mode</Text>
            <Text style={styles.muted}>
              Return realistic sample findings without calling the API. Great for testing with no key
              or spend.
            </Text>
          </View>
          <Switch value={mock} onValueChange={onToggleMock} />
        </View>
      </View>

      {/* API key */}
      <Text style={styles.sectionTitle}>Anthropic API key</Text>
      <View style={styles.card}>
        {envKey ? (
          <Text style={styles.muted}>
            A key is provided via the <Text style={styles.mono}>EXPO_PUBLIC_ANTHROPIC_API_KEY</Text>{' '}
            environment variable and will be used for live analysis. Clear it in your <Text style={styles.mono}>.env</Text> to
            override here.
          </Text>
        ) : (
          <>
            <Text style={styles.muted}>
              {hasStoredKey
                ? 'A key is stored on this device. Paste a new one to replace it.'
                : 'Paste your Anthropic API key to enable live analysis (mock mode must be off).'}
            </Text>
            <TextInput
              style={styles.input}
              value={keyInput}
              onChangeText={setKeyInput}
              placeholder="sk-ant-…"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <View style={styles.keyActions}>
              <Button label="Save key" onPress={onSaveKey} disabled={!keyInput.trim()} style={styles.flex} />
              {hasStoredKey ? (
                <Button label="Clear" variant="danger" onPress={onClearKey} style={styles.flex} />
              ) : null}
            </View>
          </>
        )}
      </View>

      {/* Model */}
      <Text style={styles.sectionTitle}>Model</Text>
      <View style={styles.card}>
        {MODEL_OPTIONS.map((opt, i) => {
          const selected = opt.id === model;
          return (
            <Pressable
              key={opt.id}
              onPress={() => onPickModel(opt.id)}
              style={[styles.modelRow, i > 0 && styles.modelDivider]}
            >
              <View style={[styles.radio, selected && styles.radioOn]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <Text style={styles.modelLabel}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Warnings */}
      <View style={[styles.card, styles.warnCard]}>
        <Text style={styles.warnTitle}>🔒 About calling Anthropic from the app</Text>
        <Text style={styles.warnBody}>
          Calling the API directly from a phone exposes your key on that device. This is fine for
          local testing, but a production app should route the call through a backend proxy so the key
          never ships to the client.
        </Text>
        <Text style={styles.warnBody}>
          AI findings are suggestions for human review, not verdicts — camera angle and lighting
          always differ between walkthroughs. Confirm or dismiss each finding yourself.
        </Text>
      </View>

      <Button label="Done" variant="secondary" onPress={() => navigation.goBack()} style={styles.done} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: spacing.xs },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  muted: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
  mono: { fontFamily: undefined, fontWeight: '700', color: colors.text },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    minHeight: 52,
  },
  keyActions: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  modelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  modelDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  modelLabel: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  warnCard: { backgroundColor: colors.warningMuted },
  warnTitle: { fontSize: fontSize.md, fontWeight: '800', color: colors.warning },
  warnBody: { fontSize: fontSize.sm, color: '#92400E', lineHeight: 20 },
  done: { marginTop: spacing.sm },
});
