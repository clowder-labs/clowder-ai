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
import * as https from 'node:https';
import type { WriteRequest, TimeSeries, Label, Sample } from './prometheus-remote-write.js';
import { encodeWriteRequest } from './prometheus-remote-write.js';
import { snappyCompress } from './snappy.js';

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

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

    return this.sendRequest(compressedPayload);
  }

  private sendRequest(body: Buffer): Promise<AomMetricsReporterResult> {
    return new Promise((resolve) => {
      const url = new URL(this.endpoint);
      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/x-protobuf',
          'X-Prometheus-Remote-Write-Version': '0.1.0',
          'User-Agent': 'cat-cafe-metrics-reporter/1.0',
          'Content-Length': body.length,
        },
        agent: insecureAgent,
        timeout: this.timeout,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) {
            resolve({ success: true, status });
          } else {
            resolve({ success: false, status, message: data });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ success: false, status: 0, message: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, status: 0, message: 'Timeout' });
      });

      req.write(body);
      req.end();
    });
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
  const instanceId = process.env.AOM_INSTANCE_ID;
  const hostname = process.env.AOM_HOSTNAME;
  const timeout = process.env.AOM_TIMEOUT ? parseInt(process.env.AOM_TIMEOUT, 10) : undefined;

  if (!endpoint || !projectId || !token) {
    return null;
  }

  return new AomMetricsReporter({
    endpoint,
    projectId,
    token,
    instanceId,
    hostname,
    timeout,
  });
}
