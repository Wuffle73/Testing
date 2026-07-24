import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { RootStackScreenProps } from '../navigation/types';
import { createProperty, getProperty, updateProperty } from '../db/properties';
import { colors, spacing, radius, fontSize } from '../theme/theme';
import { Button } from '../components/Button';

export function PropertyFormScreen({ route, navigation }: RootStackScreenProps<'PropertyForm'>) {
  const editingId = route.params?.propertyId;
  const isEditing = !!editingId;

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEditing ? 'Edit property' : 'Add property' });
  }, [navigation, isEditing]);

  useEffect(() => {
    if (!editingId) return;
    let active = true;
    (async () => {
      const p = await getProperty(editingId);
      if (active && p) {
        setName(p.name);
        setAddress(p.address);
      }
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [editingId]);

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Please give this property a name.');
      return;
    }
    setSaving(true);
    try {
      if (isEditing && editingId) {
        await updateProperty(editingId, { name: trimmed, address });
      } else {
        await createProperty({ name: trimmed, address });
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not save', String(err instanceof Error ? err.message : err));
      setSaving(false);
    }
  };

  if (loading) {
    return <View style={styles.container} />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Property name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. 12 Oak Street, Unit 4"
          placeholderTextColor={colors.textMuted}
          autoFocus={!isEditing}
          returnKeyType="next"
        />

        <Text style={styles.label}>Address (optional)</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={address}
          onChangeText={setAddress}
          placeholder="Street, city, postcode"
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <View style={styles.actions}>
          <Button label={isEditing ? 'Save changes' : 'Create property'} onPress={onSave} loading={saving} />
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => navigation.goBack()}
            disabled={saving}
          />
        </View>

        <Text style={styles.hint}>
          You'll add rooms and place them on a floor map from the property screen next.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.sm },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    minHeight: 52,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  actions: { marginTop: spacing.xl, gap: spacing.md },
  hint: {
    marginTop: spacing.lg,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    lineHeight: 18,
  },
});
