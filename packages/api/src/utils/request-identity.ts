/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Unified request identity resolver.
 *
 * Priority: X-Office-Claw-User header > X-Cat-Cafe-User (legacy) > userId query > fallback > default
 *
 * Header-based identity is preferred because:
 * - Not logged in access logs / referer headers / browser history
 * - Single injection point in frontend api-client
 * - Easier to upgrade to JWT/session later
 */

import type { FastifyRequest } from 'fastify';

export interface ResolveUserIdOptions {
  /** Optional explicit fallback (e.g., legacy body/form field). */
  fallbackUserId?: unknown;
  /** Optional final fallback (e.g., 'default-user' for backward compatibility). */
  defaultUserId?: string;
}

export const FRONTEND_DEFAULT_USER_ID = 'default-user';

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveDefaultOwnerUserId(): string | null {
  const ownerUserId = nonEmptyString(process.env.DEFAULT_OWNER_USER_ID);
  if (!ownerUserId || ownerUserId === FRONTEND_DEFAULT_USER_ID) return null;
  return ownerUserId;
}

export function resolveEffectiveUserId(value: unknown): string | null {
  const userId = nonEmptyString(value);
  if (!userId) return null;
  if (userId === FRONTEND_DEFAULT_USER_ID) {
    return resolveDefaultOwnerUserId() ?? userId;
  }
  return userId;
}

/**
 * Trusted request identity source for browser/API calls.
 *
 * Unlike resolveUserId(), this does not accept caller-controlled query params.
 * Reads X-Office-Claw-User first, falls back to legacy X-Cat-Cafe-User.
 */
export function resolveHeaderUserId(request: FastifyRequest): string | null {
  return resolveEffectiveUserId(request.headers['x-office-claw-user']);
}

export function resolveUserId(request: FastifyRequest, options?: ResolveUserIdOptions): string | null {
  const fromHeader = resolveHeaderUserId(request);
  if (fromHeader) return fromHeader;

  const query = request.query as Record<string, unknown>;
  const fromQuery = resolveEffectiveUserId(query.userId);
  if (fromQuery) return fromQuery;

  const fromFallback = resolveEffectiveUserId(options?.fallbackUserId);
  if (fromFallback) return fromFallback;

  return resolveEffectiveUserId(options?.defaultUserId);
}
