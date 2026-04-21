/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * AOM Access Code Client
 *
 * Fetches Prometheus access_code from AOM ListAccessCode API.
 * If no enabled access_code exists, automatically creates one via CreateAccessCode API.
 * Uses the project's SDK-HMAC-SHA256 signer.
 */

import type { FastifyBaseLogger } from 'fastify';
import * as signer from '../../utils/signer.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CasCredential {
  access: string;
  secret: string;
  sts_token: string;
  project_id: string;
}

export interface AomAccessCodeResult {
  accessCode: string;
  accessCodeId: string;
}

export interface PrometheusInstance {
  prom_id: string;
  prom_name: string;
  project_id: string;
  prom_type?: string;
  enterprise_project_id?: string;
  prom_create_timestamp?: number;
  prom_update_timestamp?: number;
  deleted_time?: number;
  prom_spec_config?: {
    prom_http_api_endpoint?: string;
    region_id?: string;
    remote_read_url?: string;
    remote_write_url?: string;
  };
}

// ─── Region extraction ──────────────────────────────────────────────────────

/**
 * Extract region from a Huawei Cloud base URL like
 * `https://versatile.cn-north-4.myhuaweicloud.com` → `cn-north-4`
 */
export function extractRegion(baseUrl: string): string {
  const match = baseUrl.match(/[a-z]{2,3}-[a-z]+-\d+/);
  return match ? match[0] : 'cn-north-4';
}

// ─── Endpoint builder ───────────────────────────────────────────────────────

/**
 * Build AOM Prometheus remote-write endpoint.
 * Format: https://aom-access.{region}.myhuaweicloud.com:8443/v1/{projectId}/0/push
 */
export function buildAomEndpoint(region: string, projectId: string): string {
  return `https://aom-access.${region}.myhuaweicloud.com:8443/v1/${projectId}/0/push`;
}

// ─── Signed request helper ───────────────────────────────────────────────────

/**
 * Build and send a signed request to AOM API.
 */
async function signedAomRequest(
  method: string,
  url: string,
  credential: CasCredential,
  body?: string,
): Promise<Response> {
  const host = new URL(url).host;
  const headers: Record<string, string> = {
    'X-Security-Token': credential.sts_token,
    host,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const request = new signer.HttpRequest(method, url, headers, body ?? '');
  const sig = new signer.Signer();
  sig.Key = credential.access;
  sig.Secret = credential.secret;
  const signedRequest = sig.Sign(request);

  return fetch(url, {
    method: signedRequest.method,
    headers: signedRequest.headers,
    ...(body !== undefined ? { body } : {}),
  });
}

// ─── CreateAccessCode API ────────────────────────────────────────────────────

/**
 * Create a new AOM access_code via CreateAccessCode API.
 * Called automatically when ListAccessCode returns no enabled codes.
 *
 * POST https://aom.{region}.myhuaweicloud.com/v1/{project_id}/access-code
 */
async function createAomAccessCode(
  credential: CasCredential,
  region: string,
  log?: FastifyBaseLogger,
): Promise<AomAccessCodeResult | null> {
  const host = `aom.${region}.myhuaweicloud.com`;
  const url = `https://${host}/v1/${credential.project_id}/access-code`;

  try {
    log?.info('[AomAccessCodeClient] No enabled access code found, creating one...');

    const response = await signedAomRequest('POST', url, credential);

    if (!response.ok) {
      const errorBody = await response.text();
      log?.error(
        { statusCode: response.status },
        '[AomAccessCodeClient] CreateAccessCode API failed',
      );
      return null;
    }

    const rawBody = await response.text();

    const data = JSON.parse(rawBody) as {
      access_code?: string;
      access_code_id?: string;
      status?: string;
    };

    if (!data.access_code) {
      log?.warn('[AomAccessCodeClient] CreateAccessCode returned no access_code');
      return null;
    }

    log?.info('[AomAccessCodeClient] Created AOM access code successfully');

    return {
      accessCode: data.access_code,
      accessCodeId: data.access_code_id ?? '',
    };
  } catch (error) {
    log?.error({ error }, '[AomAccessCodeClient] Failed to create access code');
    return null;
  }
}

// ─── ListPrometheus API ───────────────────────────────────────────────────────

const PROMETHEUS_RETRY_INTERVAL_MS = 3000;
const PROMETHEUS_MAX_RETRIES = 5;

async function listPrometheusInstances(
  credential: CasCredential,
  region: string,
  log?: FastifyBaseLogger,
): Promise<PrometheusInstance[] | null> {
  const host = `aom.${region}.myhuaweicloud.com`;
  const url = `https://${host}/v1/${credential.project_id}/aom/prometheus`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Security-Token': credential.sts_token,
      'Enterprise-Project-Id': 'all_granted_eps',
      host,
    };

    const request = new signer.HttpRequest('GET', url, headers, '');
    const sig = new signer.Signer();
    sig.Key = credential.access;
    sig.Secret = credential.secret;
    const signedRequest = sig.Sign(request);

    const response = await fetch(url, {
      method: signedRequest.method,
      headers: signedRequest.headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      log?.warn(
        { statusCode: response.status },
        '[AomAccessCodeClient] ListPrometheus API failed',
      );
      return null;
    }

    const data = (await response.json()) as {
      prometheus?: PrometheusInstance[];
    };

    return data.prometheus ?? [];
  } catch (error) {
    log?.error({ error }, '[AomAccessCodeClient] Failed to list prometheus instances');
    return null;
  }
}

export async function ensurePrometheusInstance(
  credential: CasCredential,
  region: string,
  log?: FastifyBaseLogger,
): Promise<PrometheusInstance[] | null> {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= PROMETHEUS_MAX_RETRIES; attempt++) {
    const instances = await listPrometheusInstances(credential, region, log);

    if (instances && instances.length > 0) {
      log?.info({ count: instances.length }, '[AomAccessCodeClient] Found Prometheus instances');
      return instances;
    }

    lastError = `No Prometheus instances found (attempt ${attempt}/${PROMETHEUS_MAX_RETRIES})`;
    log?.warn({ attempt, maxRetries: PROMETHEUS_MAX_RETRIES }, `[AomAccessCodeClient] ${lastError}`);

    if (attempt < PROMETHEUS_MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, PROMETHEUS_RETRY_INTERVAL_MS));
    }
  }

  log?.error({ retries: PROMETHEUS_MAX_RETRIES }, '[AomAccessCodeClient] ❌ Failed to find Prometheus instances after all retries, metrics disabled');
  return null;
}

// ─── ListAccessCode API call ─────────────────────────────────────────────────

const DEFAULT_AOM_HOST = 'aom.cn-north-4.myhuaweicloud.com';

/**
 * Call AOM ListAccessCode API using AK/SK + SecurityToken signing.
 * If no enabled access_code exists, automatically creates one via CreateAccessCode API.
 * Returns the access_code which serves as the Bearer token for Prometheus remote write.
 */
export async function fetchAomAccessCode(
  credential: CasCredential,
  region?: string,
  log?: FastifyBaseLogger,
): Promise<AomAccessCodeResult | null> {
  const { access, secret, sts_token, project_id } = credential;
  if (!access || !secret || !sts_token || !project_id) {
    log?.warn('[AomAccessCodeClient] Missing required credential fields');
    return null;
  }

  const effectiveRegion = region || 'cn-north-4';
  const host = `aom.${effectiveRegion}.myhuaweicloud.com`;
  const url = `https://${host}/v1/${project_id}/access-code`;

  try {
    const response = await signedAomRequest('GET', url, credential);

    if (!response.ok) {
      const errorBody = await response.text();
      log?.error(
        { statusCode: response.status },
        '[AomAccessCodeClient] ListAccessCode API failed',
      );
      return null;
    }

    const data = (await response.json()) as {
      access_codes?: Array<{
        access_code: string;
        access_code_id: string;
        status: string;
      }>;
    };

    const codes = data.access_codes?.filter((c) => c.status === 'enable');
    if (!codes || codes.length === 0) {
      return createAomAccessCode(credential, effectiveRegion, log);
    }

    return { accessCode: codes[0].access_code, accessCodeId: codes[0].access_code_id };
  } catch (error) {
    log?.error({ error }, '[AomAccessCodeClient] Failed to fetch access code');
    return null;
  }
}
