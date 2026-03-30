export type ProviderProfileProtocol = 'anthropic' | 'openai' | 'google' | 'huawei_maas' | 'acp';
export type ProviderProfileProvider = string;
export type ProviderProfileMode = 'subscription' | 'api_key' | 'none';
export type ProviderProfileAuthType = 'oauth' | 'api_key' | 'none';
export type BuiltinAccountClient = 'anthropic' | 'openai' | 'google' | 'dare' | 'opencode';
export type ProviderProfileKind = 'builtin' | 'api_key' | 'acp';
export type BootstrapBindingMode = 'oauth' | 'api_key' | 'skip';

export interface BootstrapBinding {
  enabled: boolean;
  mode: BootstrapBindingMode;
  accountRef?: string;
}

export type BootstrapBindings = Partial<Record<BuiltinAccountClient, BootstrapBinding>>;

export interface ProviderProfileMeta {
  id: string;
  displayName: string;
  kind: ProviderProfileKind;
  authType: ProviderProfileAuthType;
  builtin: boolean;
  client?: BuiltinAccountClient;
  protocol?: ProviderProfileProtocol;
  baseUrl?: string;
  models?: string[];
  command?: string;
  args?: string[];
  cwd?: string;
  envKeys?: string[];
  boundProviderRef?: string;
  defaultModel?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderProfileView extends ProviderProfileMeta {
  /** Legacy compatibility field; mirrors the profile id. */
  provider?: string;
  /** Legacy compatibility for current web code/tests. */
  name: string;
  /** Legacy compatibility field; builtin/oauth => subscription, api_key => api_key. */
  mode: ProviderProfileMode;
  hasApiKey: boolean;
}

export interface ProviderProfilesView {
  /** F127 account model no longer has a global active account pointer. */
  activeProfileId: string | null;
  providers: ProviderProfileView[];
  bootstrapBindings: BootstrapBindings;
  visibleBuiltinClients?: BuiltinAccountClient[];
}

export interface CreateProviderProfileInput {
  kind?: ProviderProfileKind;
  provider?: ProviderProfileProvider;
  name?: string;
  displayName?: string;
  mode?: ProviderProfileMode;
  authType?: ProviderProfileAuthType;
  protocol?: ProviderProfileProtocol;
  baseUrl?: string;
  apiKey?: string;
  modelOverride?: string;
  models?: string[];
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  boundProviderRef?: string;
  defaultModel?: string;
  setActive?: boolean;
}

export interface UpdateProviderProfileInput {
  kind?: ProviderProfileKind;
  name?: string;
  displayName?: string;
  mode?: ProviderProfileMode;
  authType?: ProviderProfileAuthType;
  protocol?: ProviderProfileProtocol;
  baseUrl?: string;
  apiKey?: string;
  modelOverride?: string | null;
  models?: string[];
  command?: string;
  args?: string[];
  cwd?: string | null;
  env?: Record<string, string> | null;
  boundProviderRef?: string | null;
  defaultModel?: string | null;
}

export interface RuntimeProviderProfile {
  id: string;
  authType: ProviderProfileAuthType;
  kind: ProviderProfileKind;
  client?: BuiltinAccountClient;
  protocol?: ProviderProfileProtocol;
  baseUrl?: string;
  apiKey?: string;
  models?: string[];
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  boundProviderRef?: string;
  defaultModel?: string;
}

export interface AnthropicRuntimeProfile {
  id: string;
  mode: ProviderProfileMode;
  baseUrl?: string;
  apiKey?: string;
}

export interface ProviderProfilesMetaFile {
  version: 3;
  activeProfileId: string | null;
  providers: ProviderProfileMeta[];
  bootstrapBindings: BootstrapBindings;
}

export interface ProviderProfilesSecretsFile {
  version: 3;
  profiles: Record<string, { apiKey?: string; env?: Record<string, string> }>;
}

export interface NormalizedState<T> {
  value: T;
  dirty: boolean;
}
