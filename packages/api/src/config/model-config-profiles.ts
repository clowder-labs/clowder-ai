import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProviderProfileProtocol, ProviderProfileView } from './provider-profiles.types.js';
import { resolveProviderProfilesRootSync } from './provider-profiles-root.js';

export interface ModelConfigBinding {
  id: string;
  models: string[];
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

function inferProtocol(profileId: string): ProviderProfileProtocol | undefined {
  if (profileId.trim().toLowerCase() === HUAWEI_MAAS_MODEL_SOURCE_ID) return 'huawei_maas';
  return undefined;
}

function displayNameForBinding(binding: ModelConfigBinding): string {
  if (binding.protocol === 'huawei_maas') return 'Huawei MaaS';
  return binding.id;
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
      const models = normalizeModelIds(value);
      const protocol = inferProtocol(trimmedId);
      return {
        id: trimmedId,
        models,
        ...(protocol ? { protocol } : {}),
      } satisfies ModelConfigBinding;
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
    hasApiKey: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}
