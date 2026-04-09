/**
 * Unified request identity resolver.
 *
 * Priority: X-Cat-Cafe-User header > defaultUserId
 *
 * Header-based identity is preferred because:
 * - Not logged in access logs / referer headers / browser history
 * - Single injection point in frontend api-client
 * - Easier to upgrade to JWT/session later
 *
 * C2 cut (F140): query.userId fallback removed — caller-controlled identity
 * injection via query params is a security risk.
 * P1 cut (F140): body userId / fallbackUserId removed — same class of
 * caller-controlled identity injection as query.userId.
 */

import type { FastifyRequest } from 'fastify';

export interface ResolveUserIdOptions {
  /** Optional final fallback (e.g., 'default-user' for backward compatibility). */
  defaultUserId?: string;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Trusted request identity source for browser/API calls.
 *
 * Unlike resolveUserId(), this does not accept caller-controlled query params.
 */
export function resolveHeaderUserId(request: FastifyRequest): string | null {
  return nonEmptyString(request.headers['x-cat-cafe-user']);
}

export function resolveUserId(request: FastifyRequest, options?: ResolveUserIdOptions): string | null {
  const fromHeader = resolveHeaderUserId(request);
  if (fromHeader) return fromHeader;

  return nonEmptyString(options?.defaultUserId);
}
