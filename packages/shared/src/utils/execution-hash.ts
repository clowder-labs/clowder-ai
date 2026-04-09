/**
 * Deterministic execution hash for exact-binding approval rules.
 * Binds an auth rule to a specific (toolName + toolArgs) payload,
 * preventing approved-tool reuse with different arguments.
 */

import { createHash } from 'node:crypto';

/** Sort object keys recursively for deterministic serialization. */
function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Compute a 16-char hex hash (64-bit) of tool name + canonical args.
 * Used for exact-binding approval rules so that approving `mcp_exec_command`
 * with `{command: "ls"}` does NOT also approve `{command: "rm -rf /"}`.
 */
export function computeExecutionHash(
  toolName: string,
  toolArgs: Readonly<Record<string, unknown>>,
): string {
  const canonical = JSON.stringify({ t: toolName, a: sortKeys(toolArgs) });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}
