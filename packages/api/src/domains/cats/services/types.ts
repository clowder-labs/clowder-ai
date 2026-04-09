/**
 * Agent Service Types
 * Re-exports from @clowder/core plus api-specific type aliases.
 */

// Re-export everything from @clowder/core agent types
export type {
  AgentMessage,
  AgentMessageType,
  AgentService,
  AgentServiceOptions,
  AuditContext,
  CliSpawnOptions,
  MessageMetadata,
  TokenUsage,
} from '@clowder/core';

export { mergeTokenUsage } from '@clowder/core';

// ── API-specific type aliases ──

import type { CliSpawnOptions } from '@clowder/core';

/**
 * Override factory: replaces spawnCli() for tmux-based execution.
 * Same event contract — callers iterate events identically.
 */
export type SpawnCliOverride = (options: CliSpawnOptions) => AsyncGenerator<unknown, void, undefined>;
