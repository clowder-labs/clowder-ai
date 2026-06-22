/**
 * Plugin Framework Types — F202 声明式插件注册与资源编排
 *
 * F240 KD-15: PluginConfigField replaced by shared ValueConfigField.
 * Alias kept for import compatibility during transition; will be removed.
 */

import type { ValueConfigField } from './config-field.js';

/**
 * @deprecated Use ValueConfigField from config-field.ts directly.
 * Alias kept temporarily for import compat — plugins only use value fields.
 */
export type PluginConfigField = ValueConfigField;

/** Plugin health check declaration */
export interface PluginHealthCheck {
  limbCommand?: string;
  mcpProbe?: string;
}

export type AgentProviderTransportId = 'acp' | 'cli-jsonl';
export type AgentProviderLifecycleState = 'declared' | 'transportReady' | 'routeableApproved' | 'healthy';
export type AgentProviderSessionPolicy = 'resume' | 'stateless';
export type AgentProviderOutputProfile = 'clowder-code-turn-result-v1';
export type AgentProviderSandboxRequest = 'workspace-read' | 'workspace-write';
export type AgentProviderHealthCheckType = 'acpInitialize' | 'cliProbe';

export interface AgentProviderHealthCheckRequest {
  type: AgentProviderHealthCheckType;
}

export interface PluginAgentProviderResource {
  name: string;
  transport: AgentProviderTransportId;
  command: string;
  startupArgs: string[];
  resumeArgs?: string[];
  sessionPolicy?: AgentProviderSessionPolicy;
  outputProfile?: AgentProviderOutputProfile;
  timeoutMs?: number;
  /** Plugin-requested capability names. Host policy decides the actual grant in later slices. */
  mcpWhitelistRequest?: string[];
  /** Plugin-requested sandbox tier. Host policy decides the actual grant in later slices. */
  sandboxRequest?: AgentProviderSandboxRequest;
  healthCheck?: AgentProviderHealthCheckRequest;
}

/** Plugin resource declaration */
export interface PluginResourceDef {
  type: 'skill' | 'mcp' | 'limb' | 'schedule' | 'agentProvider';
  /** F202 Phase 2: Factory ID for schedule resources (white-list reference, no arbitrary scripts) */
  factoryId?: string;
  /** F202 Phase 2 follow-up: optional resources don't count toward 'partial' status when deps are missing */
  optional?: boolean;
  /** F241 Phase B Slice 2a: non-routeable agent provider declaration. */
  agentProvider?: PluginAgentProviderResource;
  path?: string;
  name?: string;
  command?: string;
  args?: string[];
  transport?: string;
  url?: string;
}

/** Parsed plugin manifest (from plugin.yaml) */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  icon?: string;
  iconBg?: string;
  builtin?: boolean;
  docsUrl?: string;
  setupSteps?: string[];
  config: PluginConfigField[];
  healthCheck?: PluginHealthCheck;
  resources: PluginResourceDef[];
}

/** Derived plugin status */
export type PluginStatus = 'enabled' | 'configured' | 'not_configured' | 'partial';

/** Per-resource activation status */
export interface PluginResourceStatus {
  type: string;
  path?: string;
  name?: string;
  enabled: boolean;
  agentProviderState?: AgentProviderLifecycleState;
  error?: string;
}

/** Full plugin info returned by API (manifest + derived state) */
export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  icon?: string;
  iconBg?: string;
  docsUrl?: string;
  setupSteps?: string[];
  status: PluginStatus;
  configured: boolean;
  /** Config fields with current values. `sensitive` is computed from field type. */
  config: (ValueConfigField & { currentValue: string | null; sensitive: boolean })[];
  healthCheck?: PluginHealthCheck;
  resources: PluginResourceStatus[];
  hasHealthCheck: boolean;
}
