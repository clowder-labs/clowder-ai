/**
 * Edition system types — Core/Edition boundary definitions.
 *
 * These types define the contract between Core and Edition Modules.
 * Core defines the interfaces; Edition implements them.
 *
 * @see binary-core-product-line-v3.md §4-6
 * [宪宪/Opus-46🐾] Phase 1 — Edition Types
 */

import type { IdentityMode } from '../identity/identity-resolver.js';

// ─── Model Source Contract (§4.2) ─────────────────────

export interface ModelEntry {
  id: string;
  displayName: string;
  provider: string;
  maxTokens?: number;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface RuntimeModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface IModelSource {
  readonly id: string;
  listModels(): Promise<ModelEntry[]>;
  resolveRuntimeConfig(modelId: string): Promise<RuntimeModelConfig>;
}

// ─── Skill Source Contract (§4.3) ─────────────────────

export interface SkillSearchResult {
  id: string;
  name: string;
  description: string;
  version: string;
  source: string;
}

export interface ISkillSource {
  readonly id: string;
  search(query: string): Promise<SkillSearchResult[]>;
  install(skillId: string): Promise<void>;
  uninstall(skillId: string): Promise<void>;
}

// ─── Connector Contract (§5, v3 enhanced) ─────────────

export interface ConnectorConfig {
  [key: string]: unknown;
}

export interface InboundEvent {
  connectorId: string;
  userId?: string;
  messageText?: string;
  raw?: unknown;
}

export interface OutboundMessage {
  connectorId: string;
  userId?: string;
  text?: string;
  richPayload?: unknown;
}

export interface ConnectorCapabilities {
  supportsInbound: boolean;
  supportsOutbound: boolean;
  supportedMessageTypes: string[];
}

export interface IConnectorAdapter {
  readonly id: string;
  readonly displayName: string;
  initialize(config: ConnectorConfig): Promise<void>;
  handleInbound(event: InboundEvent): Promise<void>;
  sendOutbound(message: OutboundMessage): Promise<void>;
  shutdown(): Promise<void>;
  health(): Promise<{ status: 'ok' | 'degraded' | 'down'; reason?: string }>;
  capabilities(): ConnectorCapabilities;
}

// ─── Edition Registry (§6) ────────────────────────────

export interface EditionRegistry {
  addModelSource(source: IModelSource): void;
  addSkillSource(source: ISkillSource): void;
  addConnector(adapter: IConnectorAdapter): void;
  readonly modelSources: readonly IModelSource[];
  readonly skillSources: readonly ISkillSource[];
  readonly connectors: readonly IConnectorAdapter[];
}

export interface IEditionModule {
  register(registry: EditionRegistry): Promise<void>;
}

// ─── Branding (§4.4) ─────────────────────────────────

export interface BrandingConfig {
  appName: string;
  windowTitle?: string;
  logoSrc?: string;
  themeColor?: string;
  locale?: string;
  assetsDir?: string;
}

// ─── Capability Manifest (§4.4) ───────────────────────

export interface CapabilityManifest {
  branding: BrandingConfig;
  identity: { mode: IdentityMode };
  features: {
    remoteSkillHub: boolean;
    voiceIO: boolean;
    agentTeams: boolean;
    werewolfGame: boolean;
    [key: string]: boolean;
  };
  connectors: string[];
  modelSources: string[];
}

// ─── Model Config Policy (§4.2) ─────────────────────
// Edition-provided rules that govern model source behavior.
// Core has no hardcoded vendor model source IDs — Edition configures them.

export interface ModelSourceProtocolRule {
  /** Protocol identifier (e.g. 'huawei_maas'). Core treats it as opaque string. */
  protocol: string;
  /** Display name for UI (e.g. 'Huawei MaaS'). */
  displayName: string;
  /** Whether this protocol uses API keys (false = session/header auth). */
  hasApiKey: boolean;
  /** Auth type for profile views ('none' for session-based, 'api_key' for key-based). */
  authType: 'none' | 'api_key';
  /** Resolver function to get runtime config from session/env. Edition provides this. */
  resolveRuntimeConfig?: (userId: string) => {
    baseUrl: string;
    apiKey: string;
    defaultHeaders: Record<string, string>;
  };
}

export interface ModelConfigPolicy {
  /** Source IDs that are reserved (can't be user-created/updated/deleted). */
  reservedSourceIds: string[];
  /** Map from source ID → protocol (for auto-inference). */
  protocolInference: Record<string, string>;
  /** Protocol-specific rules. Keyed by protocol string. */
  protocolRules: Record<string, ModelSourceProtocolRule>;
}

/** Default policy for community edition — no reserved IDs, no vendor protocols. */
export const DEFAULT_MODEL_CONFIG_POLICY: ModelConfigPolicy = {
  reservedSourceIds: [],
  protocolInference: {},
  protocolRules: {},
};

// ─── Edition Config (full) ────────────────────────────

export interface EditionConfig {
  coreApiVersion: string;
  editionMain?: string;
  edition: string;
  version: string;
  branding: BrandingConfig;
  identity: { mode: IdentityMode };
  features: Record<string, boolean>;
  modelConfigPolicy: ModelConfigPolicy;
  _registry?: EditionRegistryImpl;
}

// ─── Registry Implementation ──────────────────────────

export class EditionRegistryImpl implements EditionRegistry {
  private _modelSources: IModelSource[] = [];
  private _skillSources: ISkillSource[] = [];
  private _connectors: IConnectorAdapter[] = [];
  private _frozen = false;

  addModelSource(source: IModelSource): void {
    this.assertNotFrozen();
    this._modelSources.push(source);
  }

  addSkillSource(source: ISkillSource): void {
    this.assertNotFrozen();
    this._skillSources.push(source);
  }

  addConnector(adapter: IConnectorAdapter): void {
    this.assertNotFrozen();
    this._connectors.push(adapter);
  }

  get modelSources(): readonly IModelSource[] {
    return this._modelSources;
  }

  get skillSources(): readonly ISkillSource[] {
    return this._skillSources;
  }

  get connectors(): readonly IConnectorAdapter[] {
    return this._connectors;
  }

  freeze(): void {
    this._frozen = true;
    Object.freeze(this._modelSources);
    Object.freeze(this._skillSources);
    Object.freeze(this._connectors);
  }

  private assertNotFrozen(): void {
    if (this._frozen) throw new Error('EditionRegistry is frozen — cannot register after startup');
  }
}
