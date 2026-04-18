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
        { statusCode: response.status, body: errorBody, url },
        '[AomAccessCodeClient] CreateAccessCode API failed',
      );
      return null;
    }

    const data = (await response.json()) as {
      access_code?: string;
      access_code_id?: string;
      status?: string;
    };

    if (!data.access_code) {
      log?.warn('[AomAccessCodeClient] CreateAccessCode returned no access_code');
      return null;
    }

    log?.info(
      { accessCodeId: data.access_code_id },
      '[AomAccessCodeClient] ✅ Created AOM access code successfully',
    );

    return {
      accessCode: data.access_code,
      accessCodeId: data.access_code_id ?? '',
    };
  } catch (error) {
    log?.error({ error, url }, '[AomAccessCodeClient] Failed to create access code');
    return null;
  }
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
        { statusCode: response.status, body: errorBody, url },
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
      // No enabled access_code — auto-create one
      return createAomAccessCode(credential, effectiveRegion, log);
    }

    const { access_code, access_code_id } = codes[0];
    log?.info({ accessCodeId: access_code_id }, '[AomAccessCodeClient] Fetched AOM access code successfully');

    return { accessCode: access_code, accessCodeId: access_code_id };
  } catch (error) {
    log?.error({ error, url }, '[AomAccessCodeClient] Failed to fetch access code');
    return null;
  }
}
