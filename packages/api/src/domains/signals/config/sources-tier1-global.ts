/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { SignalSource } from '@office-claw/shared';

// ── Signal Source Base URLs (信号源域名) ───────────────────────────
const ANTHROPIC_WEB_URL = process.env.ANTHROPIC_WEB_URL!;
const ANTHROPIC_ALIGNMENT_URL = process.env.ANTHROPIC_ALIGNMENT_URL!;
const OPENAI_WEB_URL = process.env.OPENAI_WEB_URL!;
const GOOGLE_DEEPMIND_URL = process.env.GOOGLE_DEEPMIND_URL!;
const GOOGLE_RESEARCH_URL = process.env.GOOGLE_RESEARCH_URL!;
const GOOGLE_BLOG_URL = process.env.GOOGLE_BLOG_URL!;
const META_AI_URL = process.env.META_AI_URL!;
const META_RESEARCH_URL = process.env.META_RESEARCH_URL!;
const MICROSOFT_RESEARCH_URL = process.env.MICROSOFT_RESEARCH_URL!;
const APPLE_ML_URL = process.env.APPLE_ML_URL!;
const AWS_BLOG_URL = process.env.AWS_BLOG_URL!;
const AMAZON_SCIENCE_URL = process.env.AMAZON_SCIENCE_URL!;
const XAI_URL = process.env.XAI_URL!;
const MISTRAL_URL = process.env.MISTRAL_URL!;
const COHERE_URL = process.env.COHERE_URL!;
const TOGETHER_AI_URL = process.env.TOGETHER_AI_URL!;
const GROQ_URL = process.env.GROQ_URL!;

/**
 * Tier 1 global AI labs: Anthropic, OpenAI, Google, Meta,
 * Microsoft/Apple/AWS, xAI, Mistral, Cohere, Together AI, Groq.
 */
export const TIER1_GLOBAL_SOURCES: readonly SignalSource[] = [
  // ── Anthropic (P0 — 用户特别指出) ──────────────────────────
  {
    id: 'anthropic-news',
    name: 'Anthropic Newsroom',
    url: ANTHROPIC_WEB_URL + '/news',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .news-item' },
    schedule: { frequency: 'daily' },
  },
  {
    id: 'anthropic-research',
    name: 'Anthropic Research',
    url: ANTHROPIC_WEB_URL + '/research',
    tier: 1,
    category: 'research',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .research-item, a[href*="/research/"]' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'anthropic-engineering',
    name: 'Anthropic Engineering',
    url: ANTHROPIC_WEB_URL + '/engineering',
    tier: 1,
    category: 'engineering',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .engineering-item, a[href*="/engineering/"]' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'anthropic-alignment',
    name: 'Anthropic Alignment Science',
    url: ANTHROPIC_ALIGNMENT_URL + '/',
    tier: 1,
    category: 'research',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .post-item, a[href*="/blog/"]' },
    schedule: { frequency: 'manual' },
  },

  // ── OpenAI ────────────────────────────────────────────────────
  {
    id: 'openai-news-rss',
    name: 'OpenAI News RSS',
    url: OPENAI_WEB_URL + '/news/rss.xml',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'rss' },
    schedule: { frequency: 'daily' },
  },
  {
    id: 'openai-research',
    name: 'OpenAI Research',
    url: OPENAI_WEB_URL + '/research/',
    tier: 1,
    category: 'research',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, a[href*="/research/"]' },
    schedule: { frequency: 'manual' },
  },

  // ── Google (DeepMind + Research) ──────────────────────────────
  {
    id: 'deepmind-blog',
    name: 'Google DeepMind Blog',
    url: GOOGLE_DEEPMIND_URL + '/blog/',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .blog-card, a[href*="/blog/"]' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'deepmind-publications',
    name: 'Google DeepMind Publications',
    url: GOOGLE_DEEPMIND_URL + '/research/publications/',
    tier: 1,
    category: 'research',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .publication-card' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'google-research-blog',
    name: 'Google Research Blog',
    url: GOOGLE_RESEARCH_URL + '/blog/',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .blog-card' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'google-blog-ai',
    name: 'Google Blog AI',
    url: GOOGLE_BLOG_URL + '/technology/ai/',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .uni-blog-article' },
    schedule: { frequency: 'manual' },
  },

  // ── Meta AI ───────────────────────────────────────────────────
  {
    id: 'meta-ai-blog',
    name: 'Meta AI Blog',
    url: META_AI_URL + '/blog/',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .blog-post-card, a[href*="/blog/"]' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'meta-research-publications',
    name: 'Meta Research Publications',
    url: META_RESEARCH_URL + '/publications/',
    tier: 1,
    category: 'research',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .publication-card' },
    schedule: { frequency: 'manual' },
  },

  // ── Microsoft + Apple + AWS ───────────────────────────────────
  {
    id: 'microsoft-research-rss',
    name: 'Microsoft Research Blog',
    url: MICROSOFT_RESEARCH_URL + '/en-us/research/blog/feed/',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'rss' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'apple-ml-rss',
    name: 'Apple ML Research',
    url: APPLE_ML_URL + '/feed.xml',
    tier: 1,
    category: 'research',
    enabled: true,
    fetch: { method: 'rss' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'aws-ml-blog-rss',
    name: 'AWS ML Blog',
    url: AWS_BLOG_URL + '/blogs/machine-learning/feed/',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'rss' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'amazon-science',
    name: 'Amazon Science',
    url: AMAZON_SCIENCE_URL + '/',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .card, a[href*="/publications/"]' },
    schedule: { frequency: 'manual' },
  },

  // ── Other global labs ─────────────────────────────────────────
  {
    id: 'xai-blog',
    name: 'xAI Blog',
    url: XAI_URL + '/blog',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .blog-post, a[href*="/blog/"]' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'mistral-news',
    name: 'Mistral AI News',
    url: MISTRAL_URL + '/news/',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, a[href*="/news/"]' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'cohere-research',
    name: 'Cohere Research',
    url: COHERE_URL + '/research',
    tier: 1,
    category: 'research',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .card' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'together-ai-blog',
    name: 'Together AI Blog',
    url: TOGETHER_AI_URL + '/blog',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .blog-card, a[href*="/blog/"]' },
    schedule: { frequency: 'manual' },
  },
  {
    id: 'groq-news',
    name: 'Groq News',
    url: GROQ_URL + '/news/',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: { method: 'webpage', selector: 'article, .news-item' },
    schedule: { frequency: 'manual' },
  },
];
