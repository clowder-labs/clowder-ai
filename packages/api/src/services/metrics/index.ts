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
  createAomMetricsReporterFromEnv,
  type AomMetricsReporterConfig,
  type MetricValue,
  type AomMetricsReporterResult,
} from './aom-reporter.js';
export {
  fetchAomAccessCode,
  buildAomEndpoint,
  extractRegion,
  type CasCredential,
  type AomAccessCodeResult,
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
  initMetricsService,
  initMetricsServiceFromCredential,
  startTokenUsageReporter,
  getMetricsReporter,
  resetMetricsReporter,
  reportMetric,
} from './metrics-service.js';
