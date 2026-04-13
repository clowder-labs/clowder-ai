/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { SignalSource } from '@office-claw/shared';

// ── Signal Source Base URLs (信号源域名) ───────────────────────────
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL!;
const QWEN_BLOG_URL = process.env.QWEN_BLOG_URL!;
const MOONSHOT_PLATFORM_URL = process.env.MOONSHOT_PLATFORM_URL!;
const ZHIPU_BIGMODEL_URL = process.env.ZHIPU_BIGMODEL_URL!;
const BYTEDANCE_SEED_URL = process.env.BYTEDANCE_SEED_URL!;
const GITHUB_API_URL = process.env.GITHUB_API_URL!;

/**
 * Tier 1 China AI labs: DeepSeek, Qwen, Moonshot, Zhipu, ByteDance.
 * Includes GitHub API sources for repos tracking.
 */
export const TIER1_CHINA_SOURCES: readonly SignalSource[] = [
  // ── 国内厂商 ──────────────────────────────────────────────────
  {
    id: 'deepseek-api-news',
    name: 'DeepSeek API News',
    url: DEEPSEEK_API_URL + '/news',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .news-item, main a' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'qwen-blog',
    name: 'Qwen Blog',
    url: QWEN_BLOG_URL + '/blog/',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .post-card, a[href*="/blog/"]' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'moonshot-docs',
    name: 'Moonshot Docs',
    url: MOONSHOT_PLATFORM_URL + '/docs/overview',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, main' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'zhipu-report',
    name: '智谱技术报告',
    url: ZHIPU_BIGMODEL_URL + '/technology-report',
    tier: 1,
    category: 'research',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .report-card' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'bytedance-seed-blog',
    name: '字节 Seed Blog',
    url: BYTEDANCE_SEED_URL + '/blog',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .blog-card' },
    schedule: { frequency: 'manual' },
  },

  // ── 国内厂商 GitHub (API fetcher) ─────────────────────────────
  {
    id: 'deepseek-github',
    name: 'DeepSeek GitHub Repos',
    url: GITHUB_API_URL + '/orgs/deepseek-ai/repos?sort=updated&per_page=10',
    tier: 1,
    category: 'engineering',
    enabled: true,
    fetch: {
      method: 'api',
      headers: { Accept: 'application/vnd.github.v3+json' },
    },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'qwen-github',
    name: 'Qwen GitHub Repos',
    url: GITHUB_API_URL + '/orgs/QwenLM/repos?sort=updated&per_page=10',
    tier: 1,
    category: 'engineering',
    enabled: true,
    fetch: {
      method: 'api',
      headers: { Accept: 'application/vnd.github.v3+json' },
    },
    schedule: { frequency: 'manual' },
  },
];
