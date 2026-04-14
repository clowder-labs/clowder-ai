/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Global Metrics Service
 *
 * Singleton for immediate metric reporting (e.g., login events).
 * Supports dynamic initialization via login credentials (AK/SK + SecurityToken)
 * instead of relying solely on environment variables.
 */

import type { FastifyBaseLogger } from 'fastify';
import type { AomMetricsReporter } from './aom-reporter.js';
import { createAomMetricsReporter } from './aom-reporter.js';
import { createTokenUsageReporter, type TokenUsageReporter } from './token-usage-reporter.js';
import {
  fetchAomAccessCode,
  buildAomEndpoint,
  extractRegion,
  type CasCredential,
} from './aom-access-code-client.js';

let reporter: AomMetricsReporter | null = null;
let tokenUsageReporter: TokenUsageReporter | null = null;
let initPromise: Promise<boolean> | null = null;

/**
 * Initialize from environment variables (legacy path).
 * Returns true if successfully initialized.
 */
export function initMetricsService(): boolean {
  const endpoint = process.env.AOM_METRICS_ENDPOINT;
  const projectId = process.env.AOM_PROJECT_ID;
  const token = process.env.AOM_TOKEN;
  const instanceId = process.env.AOM_INSTANCE_ID;
  const hostname = process.env.AOM_HOSTNAME;
  const timeout = process.env.AOM_TIMEOUT ? parseInt(process.env.AOM_TIMEOUT, 10) : undefined;

  if (!endpoint || !projectId || !token) {
    return false;
  }

  reporter = createAomMetricsReporter({
    endpoint,
    projectId,
    token,
    instanceId,
    hostname,
    timeout,
  });
  return true;
}

/**
 * Start the periodic token usage reporter.
 * Called after successful init (env or credential).
 */
export function startTokenUsageReporter(intervalMs?: number): void {
  if (tokenUsageReporter) return; // already running
  if (!reporter) return;

  tokenUsageReporter = createTokenUsageReporter({
    reporter,
    intervalMs: intervalMs ?? 60_000,
  });
  tokenUsageReporter.start();
  console.log('[MetricsService] Token usage reporter started');
}

/**
 * Initialize metrics service using CAS login credentials.
 * Fetches AOM access_code via ListAccessCode API, builds endpoint from region + projectId.
 *
 * This is idempotent — if already initialized, returns the existing reporter.
 * Concurrent calls coalesce into a single init attempt.
 */
export async function initMetricsServiceFromCredential(
  credential: CasCredential,
  huaweiClawBaseUrl: string,
  instanceId?: string,
  log?: FastifyBaseLogger,
): Promise<boolean> {
  // Already initialized — reuse
  if (reporter) return true;

  // Coalesce concurrent calls
  if (initPromise) return initPromise;

  initPromise = doInitFromCredential(credential, huaweiClawBaseUrl, instanceId, log);
  return initPromise;
}

async function doInitFromCredential(
  credential: CasCredential,
  huaweiClawBaseUrl: string,
  instanceId?: string,
  log?: FastifyBaseLogger,
): Promise<boolean> {
  try {
    const region = extractRegion(huaweiClawBaseUrl);
    const endpoint = buildAomEndpoint(region, credential.project_id);

    const result = await fetchAomAccessCode(credential, region, log);
    if (!result) {
      log?.warn('[MetricsService] Failed to fetch AOM access code, metrics disabled');
      return false;
    }

    reporter = createAomMetricsReporter({
      endpoint,
      projectId: credential.project_id,
      token: result.accessCode,
      instanceId,
    });

    log?.info('[MetricsService] ✅ Initialized from CAS credentials');
    return true;
  } catch (error) {
    log?.error({ error }, '[MetricsService] Failed to initialize from credential');
    return false;
  } finally {
    // Allow retry on next login
    initPromise = null;
  }
}

export function getMetricsReporter(): AomMetricsReporter | null {
  return reporter;
}

export function resetMetricsReporter(): void {
  reporter = null;
  initPromise = null;
}

export async function reportMetric(
  name: string,
  value: number,
  labels?: Record<string, string>,
): Promise<boolean> {
  if (!reporter) return false;
  const result = await reporter.reportSingleMetric(name, value, labels);
  return result.success;
}
