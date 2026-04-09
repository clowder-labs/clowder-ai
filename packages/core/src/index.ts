/**
 * @clowder/core — The headless runtime for Clowder AI
 *
 * Provides:
 * - Plugin interface (ClowderProviderPlugin) for building provider packages
 * - Plugin discovery and registration (ProviderPluginRegistry)
 * - Agent service types (AgentService, AgentMessage, AgentServiceOptions)
 * - Runtime profile types (RuntimeProviderProfile, RuntimeAcpModelProfile)
 */

// ── Plugin system ──
export type {
  ClowderProviderPlugin,
  AgentServiceFactoryContext,
  ProviderAccountSpec,
  ProviderBindingSpec,
  McpConfigWriter,
  McpConfigReader,
} from './plugin/index.js';

export { ProviderPluginRegistry } from './plugin/index.js';
export type { DiscoveryResult } from './plugin/index.js';

// ── Agent types ──
export type {
  AgentMessage,
  AgentMessageType,
  AgentService,
  AgentServiceOptions,
  AuditContext,
  ChildProcessLike,
  CliSpawnOptions,
  MessageMetadata,
  TokenUsage,
  RuntimeProviderProfile,
  RuntimeAcpModelProfile,
  ProviderProfileProtocol,
  ProviderProfileAuthType,
  ProviderProfileKind,
  BuiltinAccountClient,
  ACPModelAccessMode,
  AcpModelProviderType,
} from './agent/index.js';

export { mergeTokenUsage } from './agent/index.js';
