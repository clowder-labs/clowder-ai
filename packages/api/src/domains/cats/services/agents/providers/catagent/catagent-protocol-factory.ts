/**
 * CatAgent Protocol Factory — F159 Phase G Slice G1 + G2
 *
 * Single entry point for service to obtain a configured
 * {@link CatAgentProtocolAdapter}. G2 (KD-19/KD-20) dispatches based on
 * `catConfig.catAgentProtocol`:
 * - `undefined` / `'anthropic-messages'` → `AnthropicMessagesAdapter` (G1 default,
 *   preserves G1 catagent member behavior — KD-25 first half byte-stable)
 * - `'openai-chat'` → `OpenAIChatAdapter` (G2 Axis 5, implementation pending)
 * - unknown value → **fail closed (throw)** — KD-20: no fallback, no
 *   runtime protocol guessing, no silent vendor routing
 *
 * Service code never instantiates adapters directly — it calls this factory.
 * AC-G12 grep verifier asserts service contains no `new
 * AnthropicMessagesAdapter` (or any other adapter constructor).
 */

import type { CatAgentProtocol, CatConfig } from '@cat-cafe/shared';
import { AnthropicMessagesAdapter } from './anthropic-messages-adapter.js';
import type { CatAgentProtocolAdapter } from './catagent-protocol-adapter.js';

/**
 * Select and instantiate the protocol adapter for a CatAgent member.
 *
 * Selection strategy = spec Slice G2 option A: explicit `catAgentProtocol`
 * field on `CatConfig` (set via Hub UI / routes / catalog persistence,
 * see G2 Axis 1 step 1a-1c). G2 KD-20 explicitly rejects option B
 * (probing baseUrl shape) — that path is fragile, unauditable, and grows
 * exponentially as protocols are added.
 *
 * Fail-closed contract:
 * - Unknown protocol value → throw before any HTTP / credential resolution
 * - Caller (invoke-single-cat host integration) surfaces the failure as
 *   a normal credentials/init error to user; no silent fallback
 */
export function createCatAgentProtocolAdapter(catConfig: CatConfig | null): CatAgentProtocolAdapter {
  const protocol = catConfig?.catAgentProtocol;

  // Default branch: G1 catagent members (no catAgentProtocol persisted) +
  // explicit 'anthropic-messages' both land here. Byte-stable with G1
  // (KD-25 AC-G31 verifies factory default branch unchanged).
  if (protocol === undefined || protocol === 'anthropic-messages') {
    return new AnthropicMessagesAdapter();
  }

  if (protocol === 'openai-chat') {
    // G2 Axis 5 — OpenAIChatAdapter implementation is the next slice in this
    // PR. Until it lands, this branch fail-closes with an actionable error
    // so a user who Hub-configures 'openai-chat' early gets a clear signal
    // instead of silently routing to Anthropic Messages (which would 404 on
    // any OpenAI-only proxy — exactly the failure mode that triggered G2,
    // KD-23).
    throw new CatAgentProtocolNotImplementedError(protocol);
  }

  // KD-20 fail-closed: unrecognised protocol values throw. Service surfaces
  // this as a credentials/init failure; no fallback to AnthropicMessagesAdapter.
  throw new CatAgentProtocolUnknownError(protocol as string);
}

export class CatAgentProtocolUnknownError extends Error {
  readonly protocol: string;
  constructor(protocol: string) {
    super(
      `[catagent] Unknown catAgentProtocol "${protocol}" — fail-closed per KD-20 (no runtime protocol guessing). ` +
        `Valid values: 'anthropic-messages' | 'openai-chat'.`,
    );
    this.name = 'CatAgentProtocolUnknownError';
    this.protocol = protocol;
  }
}

export class CatAgentProtocolNotImplementedError extends Error {
  readonly protocol: CatAgentProtocol;
  constructor(protocol: CatAgentProtocol) {
    super(
      `[catagent] catAgentProtocol "${protocol}" is recognised but its adapter is not yet implemented in this build. ` +
        `Tracking: F159 Phase G G2 Axis 5 (OpenAIChatAdapter). Until then, use 'anthropic-messages' or leave catAgentProtocol unset.`,
    );
    this.name = 'CatAgentProtocolNotImplementedError';
    this.protocol = protocol;
  }
}
