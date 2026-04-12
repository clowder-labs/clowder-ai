/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { AchievementStore } from '../../dist/domains/leaderboard/achievement-store.js';
import { GameStore } from '../../dist/domains/leaderboard/game-store.js';
import { leaderboardEventsRoutes } from '../../dist/routes/leaderboard-events.js';

async function buildApp() {
  const app = Fastify();
  const gameStore = new GameStore();
  const achievementStore = new AchievementStore();
  await app.register(leaderboardEventsRoutes, { gameStore, achievementStore });
  return { app, gameStore, achievementStore };
}

const VALID_EVENT = {
  eventId: 'evt-1',
  source: 'game',
  catId: 'opus',
  eventType: 'game-result',
  payload: { game: 'cat-kill', result: 'win' },
  timestamp: new Date().toISOString(),
};

describe('POST /api/leaderboard/events', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/leaderboard/events',
      payload: VALID_EVENT,
      // No x-office-claw-user header
    });
    assert.equal(res.statusCode, 401);
    assert.ok(JSON.parse(res.body).error.includes('Authentication'));
  });

  it('accepts authenticated requests', async () => {
    const { app, gameStore } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/leaderboard/events',
      payload: VALID_EVENT,
      headers: { 'x-office-claw-user': 'user1' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).status, 'ok');
    assert.equal(gameStore.size, 1);
  });

  it('deduplicates by eventId', async () => {
    const { app, gameStore } = await buildApp();
    const headers = { 'x-office-claw-user': 'user1' };
    await app.inject({ method: 'POST', url: '/api/leaderboard/events', payload: VALID_EVENT, headers });
    const res = await app.inject({ method: 'POST', url: '/api/leaderboard/events', payload: VALID_EVENT, headers });
    assert.equal(JSON.parse(res.body).status, 'duplicate');
    assert.equal(gameStore.size, 1); // not duplicated
  });

  it('routes achievement_unlocked to achievement store', async () => {
    const { app, achievementStore } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/leaderboard/events',
      payload: {
        eventId: 'evt-ach-1',
        source: 'bootcamp',
        catId: 'opus',
        eventType: 'achievement_unlocked',
        payload: { achievementId: 'cvo-first-review' },
        timestamp: new Date().toISOString(),
      },
      headers: { 'x-office-claw-user': 'user1' },
    });
    assert.equal(res.statusCode, 200);
    const unlocked = achievementStore.getUnlocked('user1');
    assert.equal(unlocked.length, 1);
    assert.equal(unlocked[0].id, 'cvo-first-review');
  });

  it('unauthenticated request does not poison dedup set', async () => {
    const { app, gameStore } = await buildApp();
    // First: unauthenticated → 401, must NOT mark eventId as seen
    const r1 = await app.inject({
      method: 'POST',
      url: '/api/leaderboard/events',
      payload: VALID_EVENT,
    });
    assert.equal(r1.statusCode, 401);

    // Second: same eventId but authenticated → should succeed (not "duplicate")
    const r2 = await app.inject({
      method: 'POST',
      url: '/api/leaderboard/events',
      payload: VALID_EVENT,
      headers: { 'x-office-claw-user': 'user1' },
    });
    assert.equal(r2.statusCode, 200);
    assert.equal(JSON.parse(r2.body).status, 'ok');
    assert.equal(gameStore.size, 1);
  });

  it('rejects invalid source', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/leaderboard/events',
      payload: { ...VALID_EVENT, eventId: 'evt-bad', source: 'invalid' },
      headers: { 'x-office-claw-user': 'user1' },
    });
    assert.equal(res.statusCode, 400);
  });
});
