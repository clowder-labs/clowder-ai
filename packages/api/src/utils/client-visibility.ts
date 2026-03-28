import type { BootstrapBindings, BuiltinAccountClient, ProviderProfileView } from '../config/provider-profiles.types.js';

export type VisibleClientId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'dare'
  | 'opencode'
  | 'antigravity'
  | 'relayclaw'
  | 'acp';

const ALL_CLIENT_IDS: VisibleClientId[] = ['anthropic', 'openai', 'google', 'dare', 'opencode', 'antigravity', 'relayclaw', 'acp'];
const ALL_BUILTIN_AUTH_CLIENTS: BuiltinAccountClient[] = ['anthropic', 'openai', 'google', 'dare', 'opencode'];

function isBuiltinClientsEnabled(): boolean {
  const raw = process.env.CAT_CAFE_BUILTIN_CLIENTS_ENABLED;
  return raw === 'true' || raw === '1';
}

function isBuiltinClientsExplicitlyDisabled(): boolean {
  const raw = process.env.CAT_CAFE_BUILTIN_CLIENTS_ENABLED;
  return raw === 'false' || raw === '0';
}

function parseCsvEnv<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: readonly T[]): T[] {
  if (raw === undefined) return [...fallback];
  if (!raw.trim()) return [];

  const allowedSet = new Set(allowed);
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is T => allowedSet.has(value as T));
  return Array.from(new Set(values));
}

export function getAllowedClientIds(): VisibleClientId[] {
  if (isBuiltinClientsEnabled()) return [...ALL_CLIENT_IDS];

  const labelKeys = Object.keys(getClientLabels()).filter((k): k is VisibleClientId =>
    ALL_CLIENT_IDS.includes(k as VisibleClientId),
  );

  // When builtin clients are explicitly disabled, CAT_CAFE_CLIENT_LABELS is
  // the single source of truth: its keys define which clients are enabled,
  // its values define console display names.
  if (isBuiltinClientsExplicitlyDisabled()) {
    if (labelKeys.length > 0) return ALL_CLIENT_IDS.filter((id) => labelKeys.includes(id));
    // Fallback to CAT_CAFE_ALLOWED_CLIENTS if no labels configured
    return parseCsvEnv(process.env.CAT_CAFE_ALLOWED_CLIENTS, ALL_CLIENT_IDS, []);
  }

  // Default (env not set): merge ALLOWED_CLIENTS and label keys
  const base = parseCsvEnv(process.env.CAT_CAFE_ALLOWED_CLIENTS, ALL_CLIENT_IDS, ALL_CLIENT_IDS);
  if (labelKeys.length === 0) return base;
  const merged = new Set([...base, ...labelKeys]);
  return ALL_CLIENT_IDS.filter((id) => merged.has(id));
}

export function isClientAllowed(client: string): client is VisibleClientId {
  return getAllowedClientIds().includes(client as VisibleClientId);
}

export function filterAllowedClients<T extends { id: string; available?: boolean }>(clients: readonly T[]): T[] {
  const allowed = new Set(getAllowedClientIds());
  return clients
    .filter((client) => allowed.has(client.id as VisibleClientId))
    .map((client) => ({ ...client, available: true }));
}

export function getAllowedBuiltinBindingClients(): BuiltinAccountClient[] {
  const allowed = new Set(getAllowedClientIds());
  return ALL_BUILTIN_AUTH_CLIENTS.filter((client) => allowed.has(client));
}

export function getVisibleBuiltinAuthClients(): BuiltinAccountClient[] {
  if (isBuiltinClientsEnabled()) return [...ALL_BUILTIN_AUTH_CLIENTS];
  const allowedBuiltinClients = getAllowedBuiltinBindingClients();
  const defaultFallback = isBuiltinClientsExplicitlyDisabled() ? [] : allowedBuiltinClients;
  return parseCsvEnv(
    process.env.CAT_CAFE_VISIBLE_BUILTIN_AUTH_CLIENTS,
    ALL_BUILTIN_AUTH_CLIENTS,
    defaultFallback,
  ).filter((client) => allowedBuiltinClients.includes(client));
}

export function filterProviderProfilesForVisibility(profiles: readonly ProviderProfileView[]): ProviderProfileView[] {
  const visibleBuiltinClients = new Set(getVisibleBuiltinAuthClients());
  return profiles.filter((profile) => !profile.builtin || (profile.client ? visibleBuiltinClients.has(profile.client) : false));
}

export function filterBootstrapBindingsForAllowedClients(bindings: BootstrapBindings): BootstrapBindings {
  const allowedClients = new Set(getAllowedBuiltinBindingClients());
  return Object.fromEntries(
    Object.entries(bindings).filter(([client]) => allowedClients.has(client as BuiltinAccountClient)),
  ) as BootstrapBindings;
}

/**
 * Compute UI visibility hints for the Hub based on client visibility config.
 * When builtin clients are explicitly disabled (simplified deployment), hide
 * tabs and env categories that aren't relevant.
 */
export function getUiHints(): {
  hiddenHubTabs: string[];
  hiddenEnvCategories: string[];
  hideSkillMountStatus: boolean;
  hideAgentGuides: boolean;
} {
  if (!isBuiltinClientsExplicitlyDisabled()) {
    return { hiddenHubTabs: [], hiddenEnvCategories: [], hideSkillMountStatus: false, hideAgentGuides: false };
  }
  const allowed = new Set(getAllowedClientIds());
  const hiddenHubTabs: string[] = [];
  if (!allowed.has('anthropic')) hiddenHubTabs.push('rescue');
  if (!allowed.has('anthropic') && !allowed.has('openai') && !allowed.has('google')) {
    hiddenHubTabs.push('routing');
  }
  // Hide voice settings in simplified deployments
  hiddenHubTabs.push('voice');
  const hiddenEnvCategories: string[] = [];
  if (!allowed.has('openai')) hiddenEnvCategories.push('codex');
  if (!allowed.has('google')) hiddenEnvCategories.push('gemini');
  // In simplified deployments, dare env is auto-configured by the preset
  hiddenEnvCategories.push('dare');
  const hideSkillMountStatus = !allowed.has('anthropic') && !allowed.has('openai') && !allowed.has('google');
  // Hide CLAUDE.md / AGENTS.md / GEMINI.md agent guides
  const hideAgentGuides = !allowed.has('anthropic') && !allowed.has('openai') && !allowed.has('google');
  return { hiddenHubTabs, hiddenEnvCategories, hideSkillMountStatus, hideAgentGuides };
}

/**
 * Parse CAT_CAFE_CLIENT_LABELS env var into a client→label map.
 * Format: "dare:九问,opencode:OC" → { dare: "九问", opencode: "OC" }
 */
export function getClientLabels(): Record<string, string> {
  const raw = process.env.CAT_CAFE_CLIENT_LABELS;
  if (!raw?.trim()) return {};
  const labels: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx <= 0) continue;
    const key = pair.slice(0, colonIdx).trim();
    const value = pair.slice(colonIdx + 1).trim();
    if (key && value) labels[key] = value;
  }
  return labels;
}
