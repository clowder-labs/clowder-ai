/**
 * @clowder/core — The headless runtime for Clowder AI
 *
 * Provides:
 * - Plugin interface (ClowderProviderPlugin) for building provider packages
 * - Plugin discovery and registration (ProviderPluginRegistry)
 * - Agent service types (AgentService, AgentMessage, AgentServiceOptions)
 * - Runtime profile types (RuntimeProviderProfile, RuntimeAcpModelProfile)
 */

// ── Agent types ──
export type {
  ACPModelAccessMode,
  AcpModelProviderType,
  AgentMessage,
  AgentMessageType,
  AgentService,
  AgentServiceOptions,
  AuditContext,
  BuiltinAccountClient,
  ChildProcessLike,
  CliSpawnOptions,
  MessageMetadata,
  ProviderProfileAuthType,
  ProviderProfileKind,
  ProviderProfileProtocol,
  RuntimeAcpModelProfile,
  RuntimeProviderProfile,
  TokenUsage,
} from './agent/index.js';
export { mergeTokenUsage } from './agent/index.js';
// ── Plugin system ──
export type {
  AgentServiceFactoryContext,
  ClowderProviderPlugin,
  DiscoveryResult,
  McpConfigReader,
  McpConfigWriter,
  ProviderAccountSpec,
  ProviderBindingSpec,
} from './plugin/index.js';
export { ProviderPluginRegistry } from './plugin/index.js';
