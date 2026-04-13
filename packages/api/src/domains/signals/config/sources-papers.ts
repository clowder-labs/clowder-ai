/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { SignalSource } from '@office-claw/shared';

// ── Signal Source Base URLs (信号源域名) ───────────────────────────
const ARXIV_EXPORT_URL = process.env.ARXIV_EXPORT_URL!;
const HUGGINGFACE_URL = process.env.HUGGINGFACE_URL!;

/**
 * Academic paper sources: arXiv feeds + HuggingFace daily papers.
 */
export const PAPER_SOURCES: readonly SignalSource[] = [
  {
    id: 'arxiv-cs-cl',
    name: 'arXiv cs.CL',
    url: ARXIV_EXPORT_URL + '/rss/cs.CL',
    tier: 1,
    category: 'papers',
    enabled: true,
    fetch: { method: 'rss' },
    schedule: { frequency: 'daily' },
    filters: {
      keywords: {
        include: ['agent', 'llm', 'context', 'tool', 'mcp', 'rag'],
      },
    },
  },
  {
    id: 'arxiv-cs-ai',
    name: 'arXiv cs.AI',
    url: ARXIV_EXPORT_URL + '/rss/cs.AI',
    tier: 1,
    category: 'papers',
    enabled: true,
    fetch: { method: 'rss' },
    schedule: { frequency: 'manual' },
    filters: {
      keywords: {
        include: ['agent', 'llm', 'reasoning', 'planning', 'tool use', 'mcp'],
      },
    },
  },
  {
    id: 'arxiv-cs-lg',
    name: 'arXiv cs.LG',
    url: ARXIV_EXPORT_URL + '/rss/cs.LG',
    tier: 1,
    category: 'papers',
    enabled: true,
    fetch: { method: 'rss' },
    schedule: { frequency: 'manual' },
    filters: {
      keywords: {
        include: ['transformer', 'llm', 'language model', 'fine-tuning', 'rlhf', 'alignment'],
      },
    },
  },
  {
    id: 'huggingface-papers',
    name: 'HuggingFace Papers',
    url: HUGGINGFACE_URL + '/papers',
    tier: 2,
    category: 'papers',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, a[href*="/papers/"]' },
    schedule: { frequency: 'manual' },
  },
];
