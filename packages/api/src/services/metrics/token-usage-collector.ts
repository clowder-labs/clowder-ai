/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Token Usage Collector
 *
 * Collects token usage data in real-time when messages are stored.
 * Usage data is buffered in memory and aggregated for periodic AOM reporting.
 */

export interface TokenUsageRecord {
  sessionId: string;
  model: string;
  agent: string;
  inputTokens: number;
  outputTokens: number;
  timestamp: number;
}

export interface TokenUsageAggregated {
  sessionId: string;
  model: string;
  agent: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  count: number;
}

class TokenUsageCollector {
  private buffer: TokenUsageRecord[] = [];
  private readonly maxBufferSize = 10000;

  collect(record: TokenUsageRecord): void {
    if (this.buffer.length >= this.maxBufferSize) {
      this.buffer.shift();
    }
    this.buffer.push(record);
    console.log(
      `[TokenUsageCollector] Collected: session=${record.sessionId} model=${record.model} agent=${record.agent} input=${record.inputTokens} output=${record.outputTokens} buffer=${this.buffer.length}`,
    );
  }

  aggregateAndClear(): TokenUsageAggregated[] {
    const records = [...this.buffer];
    this.buffer = [];

    const grouped = new Map<string, TokenUsageAggregated>();

    for (const record of records) {
      const key = `${record.sessionId}:${record.model}:${record.agent}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.inputTokens += record.inputTokens;
        existing.outputTokens += record.outputTokens;
        existing.totalTokens += record.inputTokens + record.outputTokens;
        existing.count += 1;
      } else {
        grouped.set(key, {
          sessionId: record.sessionId,
          model: record.model,
          agent: record.agent,
          inputTokens: record.inputTokens,
          outputTokens: record.outputTokens,
          totalTokens: record.inputTokens + record.outputTokens,
          count: 1,
        });
      }
    }

    return Array.from(grouped.values());
  }

  getBufferedCount(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
  }
}

export const tokenUsageCollector = new TokenUsageCollector();
