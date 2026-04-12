/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Prometheus remote write protobuf encoder.
 *
 * Manual implementation of the Prometheus remote write protocol.
 * Reference: https://github.com/prometheus/prometheus/blob/main/prompb/remote.proto
 */

export interface Label {
  name: string;
  value: string;
}

export interface Sample {
  value: number;
  timestamp: number;
}

export interface TimeSeries {
  labels: Label[];
  samples: Sample[];
}

export interface WriteRequest {
  timeseries: TimeSeries[];
}

function encodeVarint(num: number): Buffer {
  const chunks: number[] = [];
  let remaining = num;
  do {
    chunks.push((remaining & 0x7f) | (remaining > 0x7f ? 0x80 : 0));
    remaining = Math.floor(remaining / 128);
  } while (remaining > 0);
  return Buffer.from(chunks);
}

function encodeVarint64(num: number): Buffer {
  const buf = Buffer.alloc(10);
  let offset = 0;
  let remaining = num;
  while (remaining >= 0x80) {
    buf[offset++] = (remaining & 0x7f) | 0x80;
    remaining = Math.floor(remaining / 128);
  }
  buf[offset++] = remaining;
  return buf.subarray(0, offset);
}

function encodeLengthDelimited(fieldNumber: number, content: Buffer): Buffer {
  const tag = (fieldNumber << 3) | 2;
  const tagBuf = encodeVarint(tag);
  const lenBuf = encodeVarint(content.length);
  return Buffer.concat([tagBuf, lenBuf, content]);
}

function encodeFixed64(fieldNumber: number, value: number): Buffer {
  const tag = (fieldNumber << 3) | 1;
  const tagBuf = encodeVarint(tag);
  const buf = Buffer.alloc(8);
  buf.writeDoubleLE(value, 0);
  return Buffer.concat([tagBuf, buf]);
}

function encodeVarintField(fieldNumber: number, value: number): Buffer {
  const tag = (fieldNumber << 3) | 0;
  const tagBuf = encodeVarint(tag);
  const valBuf = value > 0xffffffff ? encodeVarint64(value) : encodeVarint(value);
  return Buffer.concat([tagBuf, valBuf]);
}

function encodeLabel(label: Label): Buffer {
  const chunks: Buffer[] = [];
  chunks.push(encodeLengthDelimited(1, Buffer.from(label.name, 'utf-8')));
  chunks.push(encodeLengthDelimited(2, Buffer.from(label.value, 'utf-8')));
  return Buffer.concat(chunks);
}

function encodeSample(sample: Sample): Buffer {
  const chunks: Buffer[] = [];
  chunks.push(encodeFixed64(1, sample.value));
  chunks.push(encodeVarintField(2, sample.timestamp));
  return Buffer.concat(chunks);
}

function encodeTimeSeries(ts: TimeSeries): Buffer {
  const chunks: Buffer[] = [];
  for (const label of ts.labels) {
    chunks.push(encodeLengthDelimited(1, encodeLabel(label)));
  }
  for (const sample of ts.samples) {
    chunks.push(encodeLengthDelimited(2, encodeSample(sample)));
  }
  return Buffer.concat(chunks);
}

export function encodeWriteRequest(request: WriteRequest): Buffer {
  const chunks: Buffer[] = [];
  for (const ts of request.timeseries) {
    chunks.push(encodeLengthDelimited(1, encodeTimeSeries(ts)));
  }
  return Buffer.concat(chunks);
}
