/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export {
  encodeWriteRequest,
  type WriteRequest,
  type TimeSeries,
  type Label,
  type Sample,
} from './prometheus-remote-write.js';
export { snappyCompress, snappyDecompress } from './snappy.js';
export {
  AomMetricsReporter,
  createAomMetricsReporter,
  type AomMetricsReporterConfig,
  type MetricValue,
  type AomMetricsReporterResult,
} from './aom-reporter.js';
export {
  fetchAomAccessCode,
  buildAomEndpoint,
  extractRegion,
  ensurePrometheusInstance,
  type CasCredential,
  type AomAccessCodeResult,
  type PrometheusInstance,
} from './aom-access-code-client.js';
export {
  tokenUsageCollector,
  type TokenUsageRecord,
  type TokenUsageAggregated,
} from './token-usage-collector.js';
export {
  TokenUsageReporter,
  createTokenUsageReporter,
  type TokenUsageReporterConfig,
} from './token-usage-reporter.js';
export {
  initMetricsServiceFromCredential,
  startTokenUsageReporter,
  getMetricsReporter,
  resetMetricsReporter,
  reportMetric,
} from './metrics-service.js';
