/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { WebpageFetcher } = await import('../dist/domains/signals/fetchers/webpage-fetcher.js');

function createSource(overrides = {}) {
  return {
    id: 'anthropic-news',
    name: 'Anthropic Newsroom',
    url: 'https://www.anthropic.com/news',
    tier: 1,
    category: 'official',
    enabled: true,
    fetch: {
      method: 'webpage',
      selector: 'article.news-item',
      timeoutMs: 5000,
    },
    schedule: {
      frequency: 'daily',
    },
    ...overrides,
  };
}

function createHtmlResponse(payload) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    async text() {
      return payload;
    },
  };
}

describe('WebpageFetcher', () => {
  it('canHandle returns true only for webpage sources', () => {
    const fetcher = new WebpageFetcher(async () => createHtmlResponse('<html></html>'));

    assert.equal(fetcher.canHandle(createSource()), true);
    assert.equal(fetcher.canHandle(createSource({ fetch: { method: 'api' } })), false);
  });

  it('fetch extracts article nodes by selector and resolves relative links', async () => {
    const html = `
      <html>
        <body>
          <article class="news-item">
            <h2>Claude 5 roadmap</h2>
            <a href="/news/claude-5-roadmap">Read more</a>
            <p>Roadmap update</p>
            <time datetime="2026-02-18T08:00:00.000Z"></time>
          </article>
        </body>
      </html>
    `;
    const fetcher = new WebpageFetcher(async () => createHtmlResponse(html));

    const result = await fetcher.fetch(createSource());

    assert.equal(result.errors.length, 0);
    assert.equal(result.articles.length, 1);
    assert.equal(result.articles[0].title, 'Claude 5 roadmap');
    assert.equal(result.articles[0].url, 'https://www.anthropic.com/news/claude-5-roadmap');
    assert.equal(result.articles[0].summary, 'Roadmap update');
    assert.equal(result.articles[0].publishedAt, '2026-02-18T08:00:00.000Z');
  });

  it('fetch returns structured error when selector is missing', async () => {
    const fetcher = new WebpageFetcher(async () => createHtmlResponse('<html></html>'));

    const result = await fetcher.fetch(createSource({ fetch: { method: 'webpage' } }));

    assert.equal(result.articles.length, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].code, 'WEBPAGE_FETCH_FAILED');
    assert.match(result.errors[0].message, /selector/i);
  });

  it('fetch returns structured error when downstream fetch throws', async () => {
    const fetcher = new WebpageFetcher(async () => {
      throw new Error('connection reset');
    });

    const result = await fetcher.fetch(createSource());

    assert.equal(result.articles.length, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].code, 'WEBPAGE_FETCH_FAILED');
    assert.match(result.errors[0].message, /connection reset/);
  });

  it('fetch rejects non-webpage source with clear error payload', async () => {
    const fetcher = new WebpageFetcher(async () => createHtmlResponse('<html></html>'));

    const result = await fetcher.fetch(createSource({ fetch: { method: 'rss' } }));

    assert.equal(result.articles.length, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].code, 'UNSUPPORTED_SOURCE');
  });
});
