/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * AOM Access Code Client
 *
 * Fetches Prometheus access_code from AOM ListAccessCode API
 * using the project's SDK-HMAC-SHA256 signer.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { FastifyBaseLogger } from 'fastify';

const require = createRequire(import.meta.url);

// ─── Types ───────────────────────────────────────────────────────────────────

interface SignerHttpRequestLike {
  method: string;
  headers: Record<string, string>;
  body: string;
  host?: string;
  uri?: string;
  query?: Record<string, string[]>;
}

interface SignerLike {
  Key: string;
  Secret: string;
  Sign(request: SignerHttpRequestLike): {
    hostname: string;
    path: string;
    method: string;
    headers: Record<string, string>;
  };
}

interface SignerModuleLike {
  HttpRequest: new (
    method: string,
    url: string,
    headers?: Record<string, string>,
    body?: string,
  ) => SignerHttpRequestLike;
  Signer: new () => SignerLike;
}

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

// ─── Signer Loader (reuses project's signer.cjs) ────────────────────────────

let signerModule: SignerModuleLike | null = null;

function loadSignerModule(): SignerModuleLike {
  if (signerModule) return signerModule;

  const distPath = fileURLToPath(new URL('../../utils/signer.cjs', import.meta.url));
  const sourcePath = fileURLToPath(new URL('../../../src/utils/signer.cjs', import.meta.url));
  const signerModulePath = existsSync(distPath) ? distPath : sourcePath;
  signerModule = require(signerModulePath) as SignerModuleLike;
  return signerModule;
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

// ─── ListAccessCode API call ─────────────────────────────────────────────────

const DEFAULT_AOM_HOST = 'aom.cn-north-4.myhuaweicloud.com';

/**
 * Call AOM ListAccessCode API using AK/SK + SecurityToken signing.
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
    const signer = loadSignerModule();

    const request = new signer.HttpRequest('GET', url, {
      'X-Security-Token': sts_token,
      host: host,
    }, '');

    const sig = new signer.Signer();
    sig.Key = access;
    sig.Secret = secret;

    const signedRequest = sig.Sign(request);

    const response = await fetch(url, {
      method: signedRequest.method,
      headers: signedRequest.headers,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      log?.error(
        { statusCode: response.status, body: errorBody, url },
        '[AomAccessCodeClient] ListAccessCode API failed',
      );
      return null;
    }

    const data = await response.json() as {
      access_codes?: Array<{
        access_code: string;
        access_code_id: string;
        status: string;
      }>;
    };

    const codes = data.access_codes?.filter((c) => c.status === 'enable');
    if (!codes || codes.length === 0) {
      log?.warn('[AomAccessCodeClient] No enabled access codes returned');
      return null;
    }

    const { access_code, access_code_id } = codes[0];
    log?.info(
      { accessCodeId: access_code_id },
      '[AomAccessCodeClient] Fetched AOM access code successfully',
    );

    return { accessCode: access_code, accessCodeId: access_code_id };
  } catch (error) {
    log?.error({ error, url }, '[AomAccessCodeClient] Failed to fetch access code');
    return null;
  }
}
