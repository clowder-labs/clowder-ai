/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { RssFetcher } = await import('../dist/domains/signals/fetchers/rss-fetcher.js');

function createSource(overrides = {}) {
  return {
    id: 'openai-news-rss',
    name: 'OpenAI News RSS',
    url: 'https://openai.com/news/rss.xml',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: {
      method: 'rss',
    },
    schedule: {
      frequency: 'daily',
    },
    ...overrides,
  };
}

describe('RssFetcher', () => {
  it('canHandle returns true only for rss sources', () => {
    const fetcher = new RssFetcher({
      parseURL: async () => ({ items: [] }),
    });

    assert.equal(fetcher.canHandle(createSource()), true);
    assert.equal(fetcher.canHandle(createSource({ fetch: { method: 'api' } })), false);
  });

  it('fetch maps RSS items to RawArticle and sets metadata', async () => {
    const fetcher = new RssFetcher({
      parseURL: async () => ({
        items: [
          {
            title: 'GPT-6 announcement',
            link: 'https://openai.com/index/gpt-6',
            pubDate: '2026-02-18T08:00:00.000Z',
            contentSnippet: 'A major model release.',
            content: '<p>A major model release.</p>',
          },
        ],
      }),
    });

    const result = await fetcher.fetch(createSource());

    assert.equal(result.errors.length, 0);
    assert.equal(result.articles.length, 1);
    assert.equal(result.articles[0].title, 'GPT-6 announcement');
    assert.equal(result.articles[0].url, 'https://openai.com/index/gpt-6');
    assert.equal(result.metadata.source, 'openai-news-rss');
    assert.equal(typeof result.metadata.duration, 'number');
  });

  it('falls back to guid when link is blank after trim', async () => {
    const fetcher = new RssFetcher({
      parseURL: async () => ({
        items: [
          {
            title: 'Model card update',
            link: '   ',
            guid: 'https://openai.com/index/model-card',
            pubDate: '2026-02-18T08:00:00.000Z',
          },
        ],
      }),
    });

    const result = await fetcher.fetch(createSource());

    assert.equal(result.errors.length, 0);
    assert.equal(result.articles.length, 1);
    assert.equal(result.articles[0].url, 'https://openai.com/index/model-card');
  });

  it('drops item when fallback guid is not a valid URL', async () => {
    const fetcher = new RssFetcher({
      parseURL: async () => ({
        items: [
          {
            title: 'Opaque guid item',
            link: '   ',
            guid: 'tag:example.com,2026:news-42',
            pubDate: '2026-02-18T08:00:00.000Z',
          },
        ],
      }),
    });

    const result = await fetcher.fetch(createSource());

    assert.equal(result.errors.length, 0);
    assert.equal(result.articles.length, 0);
  });

  it('fetch returns structured error when parser throws', async () => {
    const fetcher = new RssFetcher({
      parseURL: async () => {
        throw new Error('network timeout');
      },
    });

    const result = await fetcher.fetch(createSource());

    assert.equal(result.articles.length, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].code, 'RSS_FETCH_FAILED');
    assert.match(result.errors[0].message, /network timeout/);
  });

  it('fetch rejects non-rss source with clear error payload', async () => {
    const fetcher = new RssFetcher({
      parseURL: async () => ({ items: [] }),
    });

    const result = await fetcher.fetch(createSource({ fetch: { method: 'api' } }));

    assert.equal(result.articles.length, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].code, 'UNSUPPORTED_SOURCE');
  });
});
