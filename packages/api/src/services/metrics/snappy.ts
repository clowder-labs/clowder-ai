/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Snappy compression for Prometheus remote write.
 *
 * Uses npm snappy package for reliable compression.
 */

import snappy from 'snappy';

export function snappyCompress(data: Buffer): Buffer {
  const result = snappy.compressSync(data);
  return Buffer.isBuffer(result) ? result : Buffer.from(result);
}

export function snappyDecompress(data: Buffer): Buffer {
  const result = snappy.uncompressSync(data);
  return Buffer.isBuffer(result) ? result : Buffer.from(result);
}
