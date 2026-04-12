/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import Fastify from 'fastify';
import { versionRoutes } from '../dist/routes/version.js';

function createTempProjectRoot() {
  return mkdtempSync(join(tmpdir(), 'cat-cafe-version-'));
}

async function buildApp(projectRoot) {
  const app = Fastify();
  await versionRoutes(app, { projectRoot });
  await app.ready();
  return app;
}

describe('versionRoutes current version fallback order', () => {
  const tempDirs = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop(), { recursive: true, force: true });
    }
  });

  it('prefers package.json version when it exists', async () => {
    const projectRoot = createTempProjectRoot();
    tempDirs.push(projectRoot);
    writeFileSync(
      join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'temp-app', version: '2.3.4' }),
      'utf8',
    );
    writeFileSync(
      join(projectRoot, '.clowder-release.json'),
      JSON.stringify({ version: '9.9.9' }),
      'utf8',
    );

    const app = await buildApp(projectRoot);
    const response = await app.inject({ method: 'GET', url: '/api/curversion' });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().version, '2.3.4');

    await app.close();
  });

  it('falls back to .clowder-release.json when package.json is missing', async () => {
    const projectRoot = createTempProjectRoot();
    tempDirs.push(projectRoot);
    writeFileSync(
      join(projectRoot, '.clowder-release.json'),
      JSON.stringify({ version: '3.4.5' }),
      'utf8',
    );

    const app = await buildApp(projectRoot);
    const response = await app.inject({ method: 'GET', url: '/api/lastversion' });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().curversion, '3.4.5');

    await app.close();
  });

  it('uses 0.1.0 when neither package.json nor .clowder-release.json exists', async () => {
    const projectRoot = createTempProjectRoot();
    tempDirs.push(projectRoot);

    const app = await buildApp(projectRoot);
    const response = await app.inject({ method: 'GET', url: '/api/curversion' });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().version, '0.1.0');

    await app.close();
  });
});
