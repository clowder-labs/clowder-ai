/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const { mergeSources, parseLegacySources, readTargetSourceConfig } = await import(
  '../dist/scripts/migrate-signals/source-migration.js'
);

function createSource(id, url) {
  return {
    id,
    name: id,
    url,
    tier: 2,
    category: 'research',
    enabled: true,
    fetch: { method: 'rss' },
    schedule: { frequency: 'daily' },
  };
}

describe('mergeSources', () => {
  it('does not merge distinct urls that differ by query string', () => {
    const base = { version: 1, sources: [] };
    const incoming = [
      createSource('source-a', 'https://example.com/feed?tag=agent'),
      createSource('source-b', 'https://example.com/feed?tag=safety'),
    ];

    const result = mergeSources(base, incoming);

    assert.equal(result.config.sources.length, 2);
    assert.equal(result.idRemap.get('source-a'), 'source-a');
    assert.equal(result.idRemap.get('source-b'), 'source-b');
  });

  it('still merges exact duplicate urls', () => {
    const base = { version: 1, sources: [createSource('existing', 'https://example.com/feed?tag=agent')] };
    const incoming = [createSource('incoming', 'https://example.com/feed?tag=agent')];

    const result = mergeSources(base, incoming);

    assert.equal(result.config.sources.length, 1);
    assert.equal(result.idRemap.get('incoming'), 'existing');
  });
});

describe('parseLegacySources', () => {
  it('does not bind source-level aliases to the last feed when legacy source has multiple feeds', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'legacy-sources-'));
    const legacySourcesFile = join(tempDir, 'sources.yaml');

    await writeFile(
      legacySourcesFile,
      [
        'tier_1:',
        '  ai-news:',
        '    name: "AI News"',
        '    type: "official"',
        '    feeds:',
        '      - name: "feed-one"',
        '        url: "https://example.com/feed-one.xml"',
        '        type: "rss"',
        '        check_frequency: "daily"',
        '      - name: "feed-two"',
        '        url: "https://example.com/feed-two.xml"',
        '        type: "rss"',
        '        check_frequency: "daily"',
      ].join('\n'),
      'utf-8',
    );

    const result = await parseLegacySources(legacySourcesFile);

    assert.equal(result.sources.length, 2);
    assert.equal(result.aliasToId.has('ai-news'), false);
    assert.equal(result.aliasToId.has('ai-news-feed-one'), true);
    assert.equal(result.aliasToId.has('ai-news-feed-two'), true);
  });
});

describe('readTargetSourceConfig', () => {
  it('throws when existing target sources.yaml is invalid', async () => {
    const targetRoot = await mkdtemp(join(tmpdir(), 'target-sources-'));
    const targetSourcesFile = join(targetRoot, 'sources.yaml');

    await writeFile(
      targetSourcesFile,
      [
        'version: 1',
        'sources:',
        '  - id: invalid-source',
        '    name: Invalid Source',
        '    url: https://example.com/feed',
        '    tier: 9',
        '    category: official',
        '    enabled: true',
        '    fetch:',
        '      method: rss',
        '    schedule:',
        '      frequency: daily',
      ].join('\n'),
      'utf-8',
    );

    await assert.rejects(async () => {
      await readTargetSourceConfig(targetSourcesFile);
    }, /invalid signal sources config/i);
  });
});
