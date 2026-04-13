/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Token Usage Reporter
 *
 * Periodically aggregates token usage data and reports to AOM.
 * Runs on a configurable interval (default: 1 minute).
 */

import type { AomMetricsReporter, MetricValue } from './aom-reporter.js';
import { tokenUsageCollector, type TokenUsageAggregated } from './token-usage-collector.js';

const DEFAULT_REPORT_INTERVAL_MS = 60_000;

export interface TokenUsageReporterConfig {
  reporter: AomMetricsReporter;
  intervalMs?: number;
  enabled?: boolean;
}

export class TokenUsageReporter {
  private readonly reporter: AomMetricsReporter;
  private readonly intervalMs: number;
  private readonly enabled: boolean;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastReportTime: number = 0;
  private reportCount: number = 0;

  constructor(config: TokenUsageReporterConfig) {
    this.reporter = config.reporter;
    this.intervalMs = config.intervalMs ?? DEFAULT_REPORT_INTERVAL_MS;
    this.enabled = config.enabled ?? true;
  }

  start(): void {
    if (!this.enabled || this.timer) return;

    this.timer = setInterval(() => {
      this.report().catch((err) => {
        console.error('[TokenUsageReporter] Report failed:', err);
      });
    }, this.intervalMs);

    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }

    console.log(`[TokenUsageReporter] Started with interval ${this.intervalMs}ms`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[TokenUsageReporter] Stopped');
    }
  }

  async report(): Promise<void> {
    const aggregated = tokenUsageCollector.aggregateAndClear();
    if (aggregated.length === 0) {
      console.log('[TokenUsageReporter] No usage data to report');
      return;
    }

    const metrics: MetricValue[] = [];
    const now = Date.now();

    for (const item of aggregated) {
      metrics.push({
        name: 'gen_ai_client_token_usage',
        value: item.totalTokens,
        labels: {
          session: item.sessionId,
          model: item.model,
          agent: item.agent,
        },
        timestamp: now,
      });
    }

    for (const item of aggregated) {
      console.log(
        `[TokenUsageReporter] Aggregated: session=${item.sessionId} model=${item.model} agent=${item.agent} total=${item.totalTokens}`,
      );
    }

    const result = await this.reporter.reportMetrics(metrics);

    this.lastReportTime = now;
    this.reportCount += 1;

    if (result.success) {
      console.log(
        `[TokenUsageReporter] ✅ Reported ${aggregated.length} aggregated items (${metrics.length} metrics) to AOM`,
      );
    } else {
      console.error(`[TokenUsageReporter] ❌ Report failed: ${result.message}`);
    }
  }

  getStats(): { lastReportTime: number; reportCount: number; bufferedCount: number } {
    return {
      lastReportTime: this.lastReportTime,
      reportCount: this.reportCount,
      bufferedCount: tokenUsageCollector.getBufferedCount(),
    };
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}

export function createTokenUsageReporter(config: TokenUsageReporterConfig): TokenUsageReporter {
  return new TokenUsageReporter(config);
}
