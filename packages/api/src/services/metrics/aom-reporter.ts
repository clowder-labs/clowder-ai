/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * AOM metrics reporter - reports metrics to Huawei Cloud AOM service.
 *
 * Uses Prometheus remote write protocol with Snappy compression.
 */

import { hostname as getHostname } from 'node:os';
import type { WriteRequest, TimeSeries, Label, Sample } from './prometheus-remote-write.js';
import { encodeWriteRequest } from './prometheus-remote-write.js';
import { snappyCompress } from './snappy.js';

export interface AomMetricsReporterConfig {
  endpoint: string;
  projectId: string;
  token: string;
  instanceId?: string;
  hostname?: string;
  timeout?: number;
}

export interface MetricValue {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp?: number;
}

export interface AomMetricsReporterResult {
  success: boolean;
  status: number;
  message?: string;
}

const DEFAULT_TIMEOUT = 30000;

export class AomMetricsReporter {
  private readonly endpoint: string;
  private readonly projectId: string;
  private readonly token: string;
  private readonly instanceId: string;
  private readonly hostname: string;
  private readonly timeout: number;

  constructor(config: AomMetricsReporterConfig) {
    this.endpoint = config.endpoint;
    this.projectId = config.projectId;
    this.token = config.token;
    this.instanceId = config.instanceId ?? `api-${Date.now()}`;
    this.hostname = config.hostname ?? getHostname();
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  async reportMetrics(metrics: MetricValue[]): Promise<AomMetricsReporterResult> {
    if (metrics.length === 0) {
      return { success: true, status: 200, message: 'No metrics to report' };
    }

    const now = Date.now();
    const timeseries: TimeSeries[] = [];

    for (const metric of metrics) {
      const labels: Label[] = [
        { name: '__name__', value: metric.name },
        { name: 'instance', value: this.instanceId },
        { name: 'hostname', value: this.hostname },
        { name: 'project_id', value: this.projectId },
      ];

      if (metric.labels) {
        for (const [name, value] of Object.entries(metric.labels)) {
          labels.push({ name, value });
        }
      }

      const sample: Sample = {
        value: metric.value,
        timestamp: metric.timestamp ?? now,
      };

      timeseries.push({ labels, samples: [sample] });
    }

    const writeRequest: WriteRequest = { timeseries };
    const rawPayload = encodeWriteRequest(writeRequest);
    const compressedPayload = snappyCompress(rawPayload);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/x-protobuf',
      'X-Prometheus-Remote-Write-Version': '0.1.0',
      'User-Agent': 'cat-cafe-metrics-reporter/1.0',
    };

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: compressedPayload,
        signal: AbortSignal.timeout(this.timeout),
      });

      if (response.ok) {
        return { success: true, status: response.status };
      }

      let message: string | undefined;
      try {
        message = await response.text();
      } catch {
        message = `HTTP ${response.status}`;
      }

      return { success: false, status: response.status, message };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, status: 0, message };
    }
  }

  async reportSingleMetric(
    name: string,
    value: number,
    labels?: Record<string, string>,
    timestamp?: number,
  ): Promise<AomMetricsReporterResult> {
    return this.reportMetrics([{ name, value, labels, timestamp }]);
  }

  getConfig(): AomMetricsReporterConfig {
    return {
      endpoint: this.endpoint,
      projectId: this.projectId,
      token: this.token,
      instanceId: this.instanceId,
      hostname: this.hostname,
      timeout: this.timeout,
    };
  }
}

export function createAomMetricsReporter(config: AomMetricsReporterConfig): AomMetricsReporter {
  return new AomMetricsReporter(config);
}

export function createAomMetricsReporterFromEnv(): AomMetricsReporter | null {
  const endpoint = process.env.AOM_METRICS_ENDPOINT;
  const projectId = process.env.AOM_PROJECT_ID;
  const token = process.env.AOM_TOKEN;

  if (!endpoint || !projectId || !token) {
    return null;
  }

  return new AomMetricsReporter({
    endpoint,
    projectId,
    token,
    instanceId: process.env.AOM_INSTANCE_ID,
    hostname: process.env.AOM_HOSTNAME,
    timeout: process.env.AOM_TIMEOUT ? parseInt(process.env.AOM_TIMEOUT, 10) : undefined,
  });
}
