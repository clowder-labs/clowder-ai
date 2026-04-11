/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { UserInfo } from '../routes/auth.js';
import { sessions } from '../routes/auth.js';

interface HuaweiMaaSAuthInfo {
  model_app_key?: string;
  model_app_secret?: string;
}

interface HuaweiMaaSSessionModelInfo {
  model_api_url_base?: string;
  model_auth_info?: HuaweiMaaSAuthInfo;
}

const CONNECTOR_SESSION_FALLBACK_USERS = new Set(['default-user', 'debug-user']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeBaseUrl(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim().replace(/\/+$/, '');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.endsWith('/v2') ? withScheme : `${withScheme}/v2`;
}

export function buildHuaweiMaaSAuthorization(modelInfo: HuaweiMaaSSessionModelInfo): string {
  const appKey = modelInfo.model_auth_info?.model_app_key?.trim();
  const appSecret = modelInfo.model_auth_info?.model_app_secret?.trim();
  if (!appKey || !appSecret) {
    throw new Error('Huawei MaaS auth info is missing model_app_key or model_app_secret');
  }
  return `Basic ${Buffer.from(`${appKey}:${appSecret}`).toString('base64')}`;
}

export interface HuaweiMaaSRuntimeConfig {
  baseUrl: string;
  apiKey: string;
  defaultHeaders: Record<string, string>;
}

function parseSessionExpiresAt(expiresAt: string | undefined): number {
  if (!expiresAt) return Number.NaN;
  const timestamp = new Date(expiresAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function isSessionActive(session: Pick<UserInfo, 'expiresAt'> | undefined): boolean {
  if (!session) return false;
  return parseSessionExpiresAt(session.expiresAt) > Date.now();
}

function pickActiveSessionForConnectorFallback(): { userId: string; session: UserInfo } | null {
  let chosenUserId = '';
  let chosenSession: UserInfo | null = null;
  let chosenExpiry = Number.NEGATIVE_INFINITY;

  for (const [candidateUserId, candidateSession] of sessions.entries()) {
    if (!candidateSession || CONNECTOR_SESSION_FALLBACK_USERS.has(candidateUserId)) continue;
    const expiry = parseSessionExpiresAt(candidateSession.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) continue;
    if (expiry > chosenExpiry) {
      chosenExpiry = expiry;
      chosenUserId = candidateUserId;
      chosenSession = candidateSession;
    }
  }

  if (!chosenSession) return null;
  return { userId: chosenUserId, session: chosenSession };
}

export function resolveHuaweiMaaSRuntimeConfig(userId: string): HuaweiMaaSRuntimeConfig {
  const resolvedUserId = userId.trim();
  let session = sessions.get(resolvedUserId);

  if ((!session || !isSessionActive(session)) && CONNECTOR_SESSION_FALLBACK_USERS.has(resolvedUserId)) {
    const fallback = pickActiveSessionForConnectorFallback();
    if (fallback) {
      session = fallback.session;
    }
  }

  if (!session) {
    throw new Error('Huawei MaaS session not found');
  }
  if (!isSessionActive(session)) {
    throw new Error('Huawei MaaS session expired');
  }
  if (!isRecord(session.modelInfo)) {
    throw new Error('Huawei MaaS model info is missing');
  }

  const modelInfo = session.modelInfo as HuaweiMaaSSessionModelInfo;
  const rawBaseUrl = modelInfo.model_api_url_base?.trim();
  if (!rawBaseUrl) {
    throw new Error('Huawei MaaS model_api_url_base is missing');
  }

  return {
    baseUrl: normalizeBaseUrl(rawBaseUrl),
    // OpenAI-compatible SDKs still require an api_key field. Huawei MaaS auth is carried by headers.
    apiKey: 'huawei-maas-session',
    defaultHeaders: {
      Authorization: buildHuaweiMaaSAuthorization(modelInfo),
    },
  };
}
