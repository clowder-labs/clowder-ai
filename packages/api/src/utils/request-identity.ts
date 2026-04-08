/**
 * Unified request identity resolver.
 *
 * Identity source: request.auth (populated by auth middleware from session credential).
 * SessionAuthority is the sole truth source — no header/query fallbacks for identity.
 */

import type { FastifyRequest } from 'fastify';
import type { AuthContext } from '../auth/types.js';

export interface ResolveUserIdOptions {
  /** Optional explicit fallback (e.g., legacy body/form field). */
  fallbackUserId?: unknown;
  /** Optional final fallback (e.g., 'default-user' for backward compatibility). */
  defaultUserId?: string;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getAuthContext(request: FastifyRequest): AuthContext | null {
  return (request as FastifyRequest & { auth?: AuthContext }).auth ?? null;
}

/**
 * Trusted request identity source.
 * Reads from request.auth (session credential resolved by middleware).
 */
export function resolveHeaderUserId(request: FastifyRequest): string | null {
  return getAuthContext(request)?.userId ?? null;
}

/** Extracts the session ID from the middleware-populated auth context. */
export function resolveSessionId(request: FastifyRequest): string | null {
  return getAuthContext(request)?.sessionId ?? null;
}

export function resolveUserId(request: FastifyRequest, options?: ResolveUserIdOptions): string | null {
  const fromAuth = resolveHeaderUserId(request);
  if (fromAuth) return fromAuth;

  const fromFallback = nonEmptyString(options?.fallbackUserId);
  if (fromFallback) return fromFallback;

  return nonEmptyString(options?.defaultUserId);
}
