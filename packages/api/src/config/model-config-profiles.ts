import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProviderProfileProtocol, ProviderProfileView } from './provider-profiles.types.js';
import { resolveProviderProfilesRootSync } from './provider-profiles-root.js';

export interface ModelConfigBinding {
  id: string;
  models: string[];
  displayName?: string;
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  protocol?: ProviderProfileProtocol;
}
export const HUAWEI_MAAS_MODEL_SOURCE_ID = 'huawei-maas';
export const MODEL_CONFIG_FALLBACK_ENV = 'CAT_CAFE_MODEL_CONFIG_FALLBACK_ENABLED';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeModelArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function normalizeModelIds(value: unknown): string[] {
  const ids = normalizeModelArray(value)
    .map((item) => (typeof item.id === 'string' ? item.id.trim() : ''))
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function normalizeHeaderMap(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .map(([key, rawValue]) => {
      const trimmedKey = key.trim();
      const trimmedValue = typeof rawValue === 'string' ? rawValue.trim() : '';
      if (!trimmedKey || !trimmedValue) return null;
      return [trimmedKey, trimmedValue] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}
function inferProtocol(profileId: string): ProviderProfileProtocol | undefined {
  if (profileId.trim().toLowerCase() === HUAWEI_MAAS_MODEL_SOURCE_ID) return 'huawei_maas';
  return undefined;
}

function displayNameForBinding(binding: ModelConfigBinding): string {
  if (binding.protocol === 'huawei_maas') return 'Huawei MaaS';
  return binding.displayName?.trim() || binding.id;
}

function normalizeOpenAiBinding(id: string, value: Record<string, unknown>): ModelConfigBinding | null {
  const protocol = typeof value.protocol === 'string' ? value.protocol.trim().toLowerCase() : '';
  if (protocol !== 'openai') return null;

  const models = normalizeModelIds(value.models);
  const baseUrl = typeof value.baseUrl === 'string' ? value.baseUrl.trim() : '';
  const apiKey = typeof value.apiKey === 'string' ? value.apiKey.trim() : '';
  if (!baseUrl || !apiKey || models.length === 0) return null;

  const displayName = typeof value.displayName === 'string' ? value.displayName.trim() : '';
  const headers = normalizeHeaderMap(value.headers);
  return {
    id,
    models,
    protocol: 'openai',
    ...(displayName ? { displayName } : {}),
    baseUrl,
    apiKey,
    ...(headers ? { headers } : {}),
  } satisfies ModelConfigBinding;
}

function normalizeModelSourceBinding(id: string, value: unknown): ModelConfigBinding | null {
  const protocol = inferProtocol(id);
  if (Array.isArray(value)) {
    if (protocol !== 'huawei_maas') return null;
    return {
      id,
      models: normalizeModelIds(value),
      ...(protocol ? { protocol } : {}),
    } satisfies ModelConfigBinding;
  }
  if (isRecord(value)) {
    if (protocol === 'huawei_maas') {
      const models = normalizeModelIds(value.models);
      return {
        id,
        models,
        protocol,
      } satisfies ModelConfigBinding;
    }
    return normalizeOpenAiBinding(id, value);
  }
  return null;
}

export function resolveProjectModelConfigPath(projectRoot: string): string {
  return join(resolveProviderProfilesRootSync(projectRoot), '.cat-cafe', 'model.json');
}

export function isModelConfigProviderFallbackEnabled(): boolean {
  const raw = process.env[MODEL_CONFIG_FALLBACK_ENV]?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export async function readProjectModelConfigBindings(projectRoot: string): Promise<ModelConfigBinding[] | null> {
  const filePath = resolveProjectModelConfigPath(projectRoot);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as { code?: string })?.code === 'ENOENT') return null;
    throw error;
  }

  const trimmed = raw.trim();
  if (!trimmed) return [];

  const parsedRaw = JSON.parse(trimmed) as unknown;
  if (!isRecord(parsedRaw)) return [];

  return Object.entries(parsedRaw)
    .map(([id, value]) => {
      const trimmedId = id.trim();
      if (!trimmedId) return null;
      return normalizeModelSourceBinding(trimmedId, value);
    })
    .filter((entry): entry is ModelConfigBinding => entry !== null);
}

export async function findProjectModelConfigBinding(
  projectRoot: string,
  accountRef: string,
): Promise<ModelConfigBinding | null> {
  const bindings = await readProjectModelConfigBindings(projectRoot);
  if (!bindings) return null;
  const trimmedRef = accountRef.trim();
  return bindings.find((binding) => binding.id === trimmedRef) ?? null;
}

export async function readProjectModelConfigProfileViews(projectRoot: string): Promise<ProviderProfileView[] | null> {
  const bindings = await readProjectModelConfigBindings(projectRoot);
  if (!bindings) return null;

  let timestamp = new Date(0).toISOString();
  try {
    const info = await stat(resolveProjectModelConfigPath(projectRoot));
    timestamp = info.mtime.toISOString();
  } catch {
    timestamp = new Date(0).toISOString();
  }

  return bindings.map((binding) => ({
    id: binding.id,
    provider: binding.id,
    displayName: displayNameForBinding(binding),
    name: displayNameForBinding(binding),
    authType: binding.protocol === 'huawei_maas' ? 'none' : 'api_key',
    kind: 'api_key',
    builtin: false,
    mode: binding.protocol === 'huawei_maas' ? 'none' : 'api_key',
    ...(binding.protocol ? { protocol: binding.protocol } : {}),
    models: binding.models,
    hasApiKey: binding.protocol !== 'huawei_maas',
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}
