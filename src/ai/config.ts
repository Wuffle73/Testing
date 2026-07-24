import * as SecureStore from 'expo-secure-store';

import { getSetting, setSetting } from '../db/appSettings';

/**
 * AI configuration: where the Anthropic API key comes from, whether we're in
 * mock mode, and which model to use.
 *
 * The API key is a secret, so it's read from either the
 * `EXPO_PUBLIC_ANTHROPIC_API_KEY` env var (baked into the bundle at build time)
 * or from SecureStore (pasted at runtime via the Settings screen) — never
 * hardcoded, never stored in plain SQLite.
 *
 * ⚠️ Calling Anthropic directly from a mobile client exposes the key on that
 * device. This is fine for local testing; a production app must proxy the call
 * through a backend. The Settings screen surfaces this warning to the user.
 */

const KEY_STORE_KEY = 'anthropic_api_key';
const MOCK_MODE_SETTING = 'ai_mock_mode';
const MODEL_SETTING = 'ai_model';

/** Default vision-capable model. Overridable in Settings. */
export const DEFAULT_MODEL = 'claude-opus-5';

/** A few sensible model choices for the Settings picker (cheaper → pricier). */
export const MODEL_OPTIONS = [
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 (fastest, cheapest)' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5 (balanced)' },
  { id: 'claude-opus-5', label: 'Opus 5 (most capable)' },
] as const;

const envKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY?.trim();

/** True if a key is provided via the environment (can't be edited at runtime). */
export function hasEnvKey(): boolean {
  return !!envKey;
}

/** Resolves the effective API key: env var wins, else the SecureStore value. */
export async function getApiKey(): Promise<string | null> {
  if (envKey) return envKey;
  try {
    return await SecureStore.getItemAsync(KEY_STORE_KEY);
  } catch {
    return null;
  }
}

export async function setApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_STORE_KEY, key.trim());
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_STORE_KEY);
}

/**
 * Mock mode returns realistic sample findings without calling the API. Defaults
 * to ON so the app is fully testable with no key or spend.
 */
export async function getMockMode(): Promise<boolean> {
  const value = await getSetting(MOCK_MODE_SETTING);
  if (value == null) return true; // default: mock
  return value === 'true';
}

export async function setMockMode(mock: boolean): Promise<void> {
  await setSetting(MOCK_MODE_SETTING, mock ? 'true' : 'false');
}

export async function getModel(): Promise<string> {
  return (await getSetting(MODEL_SETTING)) ?? DEFAULT_MODEL;
}

export async function setModel(model: string): Promise<void> {
  await setSetting(MODEL_SETTING, model);
}

export interface AiConfig {
  mock: boolean;
  model: string;
  apiKey: string | null;
}

export async function getAiConfig(): Promise<AiConfig> {
  const [mock, model, apiKey] = await Promise.all([getMockMode(), getModel(), getApiKey()]);
  return { mock, model, apiKey };
}

/** Whether live analysis can actually run (mock off AND a key available). */
export function canRunLive(config: AiConfig): boolean {
  return !config.mock && !!config.apiKey;
}
