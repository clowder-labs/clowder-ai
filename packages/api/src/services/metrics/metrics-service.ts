/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Global Metrics Service
 *
 * Singleton for immediate metric reporting (e.g., login events).
 */

import { createAomMetricsReporterFromEnv, type AomMetricsReporter } from './aom-reporter.js';

let reporter: AomMetricsReporter | null = null;

export function initMetricsService(): boolean {
  reporter = createAomMetricsReporterFromEnv();
  return reporter !== null;
}

export async function reportMetric(name: string, value: number, labels?: Record<string, string>): Promise<boolean> {
  if (!reporter) return false;
  const result = await reporter.reportSingleMetric(name, value, labels);
  return result.success;
}
