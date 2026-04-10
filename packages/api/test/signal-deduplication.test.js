/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { createSignalArticleId, createSignalArticleIdFromNormalized, normalizeArticleUrl, DeduplicationService } =
  await import('../dist/domains/signals/services/deduplication.js');

describe('signal deduplication', () => {
  it('normalizes tracking query params and trailing slash', () => {
    const a = normalizeArticleUrl('https://example.com/post/42/?utm_source=twitter&utm_campaign=spring');
    const b = normalizeArticleUrl('https://example.com/post/42');

    assert.equal(a, b);
  });

  it('generates stable article IDs for equivalent URLs', () => {
    const idA = createSignalArticleId('https://example.com/post/42?utm_source=x');
    const idB = createSignalArticleId('https://example.com/post/42/');

    assert.equal(idA, idB);
    assert.match(idA, /^signal_[a-f0-9]{24}$/);
  });

  it('checkAndMark marks first-seen URLs as new and duplicates as existing', () => {
    const dedup = new DeduplicationService();

    const first = dedup.checkAndMark('https://example.com/post/42?utm_source=slack');
    const second = dedup.checkAndMark('https://example.com/post/42/');

    assert.equal(first.isNew, true);
    assert.equal(second.isNew, false);
    assert.equal(first.articleId, second.articleId);
    assert.equal(first.articleId, createSignalArticleIdFromNormalized(first.normalizedUrl));
  });

  it('keeps semantically different query params', () => {
    const idA = createSignalArticleId('https://example.com/search?q=agent');
    const idB = createSignalArticleId('https://example.com/search?q=rag');

    assert.notEqual(idA, idB);
  });
});
