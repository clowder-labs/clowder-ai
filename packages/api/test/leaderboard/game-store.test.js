/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GameStore } from '../../dist/domains/leaderboard/game-store.js';

const CAT_NAMES = { opus: '布偶猫', codex: '缅因猫', gemini: '暹罗猫' };

describe('GameStore', () => {
  it('appends a record and assigns an id', () => {
    const store = new GameStore();
    const rec = store.append({ game: 'cat-kill', catId: 'opus', result: 'win', timestamp: 1000 });
    assert.ok(rec.id, 'should have an id');
    assert.equal(rec.game, 'cat-kill');
    assert.equal(rec.catId, 'opus');
    assert.equal(store.size, 1);
  });

  it('getByCat filters by catId', () => {
    const store = new GameStore();
    store.append({ game: 'cat-kill', catId: 'opus', result: 'win', timestamp: 1000 });
    store.append({ game: 'cat-kill', catId: 'codex', result: 'lose', timestamp: 2000 });
    store.append({ game: 'who-spy', catId: 'opus', result: 'shame', timestamp: 3000 });
    assert.equal(store.getByCat('opus').length, 2);
    assert.equal(store.getByCat('codex').length, 1);
    assert.equal(store.getByCat('gemini').length, 0);
  });

  it('getByGame filters by game', () => {
    const store = new GameStore();
    store.append({ game: 'cat-kill', catId: 'opus', result: 'win', timestamp: 1000 });
    store.append({ game: 'who-spy', catId: 'opus', result: 'shame', timestamp: 2000 });
    store.append({ game: 'cat-kill', catId: 'codex', result: 'mvp', timestamp: 3000 });
    assert.equal(store.getByGame('cat-kill').length, 2);
    assert.equal(store.getByGame('who-spy').length, 1);
  });

  it('computeGameStats counts cat-kill wins and mvps', () => {
    const store = new GameStore();
    store.append({ game: 'cat-kill', catId: 'opus', result: 'win', timestamp: 1000 });
    store.append({ game: 'cat-kill', catId: 'opus', result: 'mvp', timestamp: 2000 });
    store.append({ game: 'cat-kill', catId: 'codex', result: 'lose', timestamp: 3000 });
    store.append({ game: 'cat-kill', catId: 'codex', result: 'win', timestamp: 4000 });

    const stats = store.computeGameStats(CAT_NAMES);
    assert.equal(stats.catKill.wins, 3); // opus win + opus mvp + codex win
    assert.equal(stats.catKill.mvps, 1);
    assert.ok(stats.catKill.topCat);
    assert.equal(stats.catKill.topCat.catId, 'opus'); // 2 wins vs codex 1
    assert.equal(stats.catKill.topCat.displayName, '布偶猫');
  });

  it('computeGameStats counts who-spy shame', () => {
    const store = new GameStore();
    store.append({ game: 'who-spy', catId: 'opus', result: 'shame', timestamp: 1000 });
    store.append({ game: 'who-spy', catId: 'opus', result: 'shame', timestamp: 2000 });
    store.append({ game: 'who-spy', catId: 'codex', result: 'shame', timestamp: 3000 });
    store.append({ game: 'who-spy', catId: 'gemini', result: 'win', timestamp: 4000 });

    const stats = store.computeGameStats(CAT_NAMES);
    assert.equal(stats.whoSpy.shameCount, 3);
    assert.ok(stats.whoSpy.shameCat);
    assert.equal(stats.whoSpy.shameCat.catId, 'opus'); // 2 shames vs codex 1
  });

  it('computeGameStats returns undefined topCat/shameCat when no records', () => {
    const store = new GameStore();
    const stats = store.computeGameStats(CAT_NAMES);
    assert.equal(stats.catKill.wins, 0);
    assert.equal(stats.catKill.mvps, 0);
    assert.equal(stats.catKill.topCat, undefined);
    assert.equal(stats.whoSpy.shameCount, 0);
    assert.equal(stats.whoSpy.shameCat, undefined);
  });
});
