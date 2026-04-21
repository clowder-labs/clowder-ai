/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { SignalSource } from '@clowder/shared';

// ── Signal Source Base URLs (信号源域名) ───────────────────────────
const LANGCHAIN_BLOG_URL = process.env.LANGCHAIN_BLOG_URL!;
const GITHUB_URL = process.env.GITHUB_URL!;
const GITHUB_API_URL = process.env.GITHUB_API_URL!;
const SIMON_WILLISON_URL = process.env.SIMON_WILLISON_URL!;
const LILIAN_WENG_URL = process.env.LILIAN_WENG_URL!;
const CHIP_HUYEN_URL = process.env.CHIP_HUYEN_URL!;
const LATENT_SPACE_URL = process.env.LATENT_SPACE_URL!;
const A16Z_URL = process.env.A16Z_URL!;
const HACKER_NEWS_URL = process.env.HACKER_NEWS_URL!;

/**
 * Tier 2-3 sources: open-source frameworks, tech bloggers,
 * VC/industry analysis, and community aggregators.
 */
export const TIER2_COMMUNITY_SOURCES: readonly SignalSource[] = [
  // ── Open-source frameworks & tools ────────────────────────────
  {
    id: 'langchain-blog-rss',
    name: 'LangChain Blog',
    url: LANGCHAIN_BLOG_URL + '/rss/',
    tier: 2,
    category: 'engineering',
    enabled: true,
    fetch: { method: 'rss' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'github-trending',
    name: 'GitHub Trending',
    url: GITHUB_URL + '/trending',
    tier: 2,
    category: 'community',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article.Box-row, .Box-row' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'vllm-github',
    name: 'vLLM GitHub Releases',
    url: GITHUB_API_URL + '/repos/vllm-project/vllm/releases?per_page=5',
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
    id: 'llamacpp-github',
    name: 'llama.cpp GitHub Releases',
    url: GITHUB_API_URL + '/repos/ggerganov/llama.cpp/releases?per_page=5',
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
    id: 'ollama-github',
    name: 'Ollama GitHub Releases',
    url: GITHUB_API_URL + '/repos/ollama/ollama/releases?per_page=5',
    tier: 2,
    category: 'engineering',
    enabled: true,
    fetch: {
      method: 'api',
      headers: { Accept: 'application/vnd.github.v3+json' },
    },
    schedule: { frequency: 'manual' },
  },

  // ── Tech bloggers ─────────────────────────────────────────────
  {
    id: 'simon-willison',
    name: 'Simon Willison',
    url: SIMON_WILLISON_URL + '/',
    tier: 2,
    category: 'community',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .entry, .day .entry' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'lilian-weng',
    name: "Lilian Weng (Lil'Log)",
    url: LILIAN_WENG_URL + '/',
    tier: 2,
    category: 'community',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .post-link' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'chip-huyen',
    name: 'Chip Huyen',
    url: CHIP_HUYEN_URL + '/',
    tier: 3,
    category: 'community',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .post' },
    schedule: { frequency: 'manual' },
  },

  // ── VC / industry analysis ────────────────────────────────────
  {
    id: 'latent-space-rss',
    name: 'Latent Space',
    url: LATENT_SPACE_URL + '/feed',
    tier: 3,
    category: 'community',
    enabled: true,
    fetch: { method: 'rss' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'a16z-ai',
    name: 'a16z AI',
    url: A16Z_URL + '/ai/',
    tier: 3,
    category: 'community',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .post-card' },
    schedule: { frequency: 'manual' },
  },

  // ── Community aggregators ─────────────────────────────────────
  {
    id: 'hacker-news-rss',
    name: 'Hacker News',
    url: HACKER_NEWS_URL + '/rss',
    tier: 3,
    category: 'community',
    enabled: true,
    fetch: { method: 'rss' },
    schedule: { frequency: 'manual' },
    filters: {
      keywords: {
        include: ['ai', 'llm', 'gpt', 'claude', 'gemini', 'agent', 'transformer', 'machine learning'],
      },
    },
  },
];
