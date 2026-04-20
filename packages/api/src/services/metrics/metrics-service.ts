/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Global Metrics Service
 *
 * Singleton for immediate metric reporting (e.g., login events).
 * Only supports initialization via CAS login credentials (AK/SK + SecurityToken).
 */

import type { FastifyBaseLogger } from 'fastify';
import type { AomMetricsReporter } from './aom-reporter.js';
import { createAomMetricsReporter } from './aom-reporter.js';
import { createTokenUsageReporter, type TokenUsageReporter } from './token-usage-reporter.js';
import {
  fetchAomAccessCode,
  buildAomEndpoint,
  extractRegion,
  ensurePrometheusInstance,
  type CasCredential,
} from './aom-access-code-client.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveActiveProjectRoot } from '../../utils/active-project-root.js';

let reporter: AomMetricsReporter | null = null;
let tokenUsageReporter: TokenUsageReporter | null = null;
let initPromise: Promise<boolean> | null = null;

const DEFAULT_VERSION = '0.1.0';

function readClawVersion(): string {
  try {
    const projectRoot = resolveActiveProjectRoot();
    
    const packageJsonPath = resolve(projectRoot, 'package.json');
    const packageVersion = readVersionFromJsonFile(packageJsonPath);
    if (packageVersion) return packageVersion;

    const releaseJsonPath = resolve(projectRoot, '.clowder-release.json');
    const releaseVersion = readVersionFromJsonFile(releaseJsonPath);
    if (releaseVersion) return releaseVersion;

    return DEFAULT_VERSION;
  } catch {
    return DEFAULT_VERSION;
  }
}

function readVersionFromJsonFile(filePath: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    return typeof parsed?.version === 'string' && parsed.version.trim().length > 0
      ? parsed.version.trim()
      : null;
  } catch {
    return null;
  }
}

/**
 * Start the periodic token usage reporter.
 * Called after successful credential-based init.
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
 * If no enabled access_code exists, automatically creates one.
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

    // Step 1: Ensure Prometheus instance exists (with retry)
    const prometheusInstances = await ensurePrometheusInstance(credential, region, log);
    if (!prometheusInstances) {
      log?.warn('[MetricsService] No Prometheus instance available, metrics disabled');
      return false;
    }

    // Step 2: Fetch AOM access code
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
      clawVersion: readClawVersion(),
    });

    log?.info('[MetricsService] Initialized from CAS credentials');
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
  log?: FastifyBaseLogger,
): Promise<boolean> {
  if (!reporter) {
    log?.warn('[MetricsService] Reporter not initialized, skipping metric report');
    return false;
  }
  const result = await reporter.reportSingleMetric(name, value, labels);
  if (result.success) {
    log?.info({ metricName: name }, '[MetricsService] Metric reported successfully');
  } else {
    log?.warn(
      {
        metricName: name,
        status: result.status,
        message: result.message,
      },
      '[MetricsService] Metric report failed',
    );
  }
  return result.success;
}
