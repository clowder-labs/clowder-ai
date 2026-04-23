/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeSillyStats } from '../../dist/domains/leaderboard/silly-stats.js';

const CAT_NAMES = { opus: 'Claude', codex: 'Codex', gemini: 'Gemini' };

function msg(id, mentions, timestamp, catId = null, content = 'x') {
  return { id, mentions, timestamp, catId, content };
}

describe('computeSillyStats', () => {
  it('detects angry scolding (真生气)', () => {
    const messages = [
      msg('1', ['opus'], 1000, null, '你怎么又犯这个错？！！！'),
      msg('2', ['opus'], 2000, null, '我让你合入没让你直接给我搞到runtime啊？！'),
      msg('3', ['codex'], 3000, null, '啊？！你怎么又忘了？！'),
    ];
    const result = computeSillyStats(messages, CAT_NAMES);
    assert.ok(result.entries.length > 0, 'should have silly entries');
    const opusEntry = result.entries.find((e) => e.catId === 'opus');
    assert.ok(opusEntry, 'opus should appear');
    assert.ok(opusEntry.count >= 2, 'opus scolded at least twice');
  });

  it('ignores affectionate teasing (亲昵骂)', () => {
    const messages = [
      msg('1', ['opus'], 1000, null, '笨蛋智能体哈哈哈'),
      msg('2', ['opus'], 2000, null, '小绿茶被我抓到了😂'),
      msg('3', ['codex'], 3000, null, '傻猫哈哈哈哈'),
    ];
    const result = computeSillyStats(messages, CAT_NAMES);
    // Affectionate messages should NOT count as scolding
    const totalCount = result.entries.reduce((sum, e) => sum + e.count, 0);
    assert.equal(totalCount, 0, 'affectionate teasing should not count');
  });

  it('returns empty for no messages', () => {
    const result = computeSillyStats([], CAT_NAMES);
    assert.deepEqual(result.entries, []);
  });

  it('counts repeated mentions across messages', () => {
    const messages = [
      msg('1', ['opus'], 1000, null, '你怎么又！！！'),
      msg('2', ['opus'], 2000, null, '我让你测试没让你直接跳过啊！！！'),
      msg('3', ['opus'], 3000, null, '又来？！你怎么又忘了？'),
      msg('4', ['codex'], 4000, null, '啊？！！！你干嘛？！'),
    ];
    const result = computeSillyStats(messages, CAT_NAMES);
    const opusEntry = result.entries.find((e) => e.catId === 'opus');
    const codexEntry = result.entries.find((e) => e.catId === 'codex');
    assert.ok(opusEntry);
    assert.ok(codexEntry);
    assert.ok(opusEntry.count > codexEntry.count, 'opus scolded more than codex');
  });

  it('uses displayName from catNames', () => {
    const messages = [msg('1', ['opus'], 1000, null, '你怎么又！！！啊？！')];
    const result = computeSillyStats(messages, CAT_NAMES);
    const entry = result.entries.find((e) => e.catId === 'opus');
    assert.ok(entry);
    assert.equal(entry.displayName, 'Claude');
  });
});
