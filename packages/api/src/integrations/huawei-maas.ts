import { authSessionStore } from '../auth/session-store.js';

interface HuaweiMaaSAuthInfo {
  model_app_key?: string;
  model_app_secret?: string;
}

interface HuaweiMaaSSessionModelInfo {
  model_api_url_base?: string;
  model_auth_info?: HuaweiMaaSAuthInfo;
}

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

export function resolveHuaweiMaaSRuntimeConfig(userId: string): HuaweiMaaSRuntimeConfig {
  const session = authSessionStore.getByUserId(userId);
  if (!session) {
    throw new Error('Huawei MaaS session not found');
  }
  // Session expiry is now handled by the store itself (getByUserId returns null if expired).
  // Extract modelInfo from providerState (Huawei provider stores it there).
  const providerState = isRecord(session.providerState) ? session.providerState : {};
  const modelInfo = isRecord(providerState.modelInfo)
    ? (providerState.modelInfo as HuaweiMaaSSessionModelInfo)
    : null;
  if (!modelInfo) {
    throw new Error('Huawei MaaS model info is missing');
  }
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
