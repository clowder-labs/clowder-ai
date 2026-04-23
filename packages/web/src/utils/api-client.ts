/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Unified API client for OfficeClaw frontend.
 *
 * - Auto-prepends NEXT_PUBLIC_API_URL
 * - Auto-injects session credential on every request
 * - Replaces scattered raw fetch() calls across hooks/components
 * - Configurable request timeout (default: 1 hour to match backend CLI timeout)
 */

import { getIsSkipAuth, getSessionId, getUserId } from './userId';

/** Default API request timeout: 1 hour (matching backend CLI_TIMEOUT_MS) */
const DEFAULT_API_TIMEOUT_MS = 60 * 60 * 1000;

function getBrowserLocation(): Location | null {
  if (typeof globalThis !== 'object' || globalThis === null) return null;
  const candidate = (globalThis as { location?: Location }).location;
  return candidate ?? null;
}

function isLoopbackHost(hostname: string | undefined): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

const PROD_API_HOST = process.env.NEXT_PUBLIC_PROD_API_URL!;
const PROD_FRONTEND_HOST = process.env.NEXT_PUBLIC_PROD_FRONTEND_HOST!;
const OFFICE_CLAW_API_HOST = process.env.OFFICE_CLAW_API_HOST!;
const DEFAULT_API_CLIENT_URL = process.env.DEFAULT_API_CLIENT_URL!;

function resolveApiUrl(): string {
  const location = getBrowserLocation();

  // Cloudflare Tunnel: API 走 api.office-claw.com，Access cookie 在 .office-claw.com 上共享
  if (location?.hostname === PROD_FRONTEND_HOST) {
    return OFFICE_CLAW_API_HOST;
  }
  if (isLoopbackHost(location?.hostname)) {
    const frontendPort = Number(location?.port ?? '') || 3003;
    const apiPort = frontendPort + 1;
    const protocol = location?.protocol ?? 'http:';
    const hostname = location?.hostname ?? '127.0.0.1';
    return `${protocol}//${hostname}:${apiPort}`;
  }
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === 'undefined') return DEFAULT_API_CLIENT_URL;
  // Derive API port from frontend port: convention is frontend + 1 = API
  // (runtime: 3001→3002, alpha: 3011→3012). Fallback to +1 of current port.
  const frontendPort = Number(location?.port ?? '') || 3001;
  const apiPort = frontendPort + 1;
  const protocol = location?.protocol ?? 'http:';
  const hostname = location?.hostname ?? 'localhost';
  return `${protocol}//${hostname}:${apiPort}`;
}
export const API_URL = resolveApiUrl();

export interface ApiFetchOptions extends RequestInit {
  /** Custom timeout in milliseconds (default: 1 hour) */
  timeoutMs?: number;
}

/**
 * Fetch wrapper that injects auth/session headers and supports timeout.
 * @param path - API path starting with '/' (e.g. '/api/messages')
 * @param init - Standard RequestInit options plus optional timeoutMs
 */
export async function apiFetch(path: string, init?: ApiFetchOptions): Promise<Response> {
  const headers = new Headers(init?.headers);
  const sessionId = getSessionId();
  if (sessionId) {
    headers.set('Authorization', `Bearer ${sessionId}`);
  } else if (getIsSkipAuth()) {
    // Skip-auth remains header-based so local dev flows keep a stable identity.
    headers.set('X-Office-Claw-User', getUserId());
  }

  const timeoutMs = init?.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;

  // Use AbortController for timeout support
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
      // Cloudflare Access: 跨子域名请求需要 credentials 才能带 CF_Authorization cookie
      credentials: API_URL.includes(PROD_API_HOST) ? 'include' : (init?.credentials ?? 'same-origin'),
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
