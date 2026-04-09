import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { CORE_API_VERSION, DEFAULT_EDITION, loadEdition } from '../dist/edition/edition-loader.js';

// ─── Helpers ─────────────────────────────────────────

const dirs = [];

function makeTmpDir() {
  const dir = mkdtempSync(join(tmpdir(), 'edition-test-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true });
    } catch {}
  }
  dirs.length = 0;
});

const silentLogger = {
  info: () => {},
  warn: () => {},
  fatal: () => {},
};

// ─── Tests ───────────────────────────────────────────

describe('loadEdition', () => {
  it('returns DEFAULT_EDITION when no edition.json exists', async () => {
    const dir = makeTmpDir();
    const config = await loadEdition({ projectRoot: dir, logger: silentLogger });
    assert.equal(config.edition, 'community');
    assert.equal(config.version, '0.0.0');
    assert.equal(config.branding.appName, 'Clowder AI');
    assert.equal(config.identity.mode, 'no-auth');
    assert.equal(config.features.remoteSkillHub, false);
  });

  it('parses edition.json branding overrides', async () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, 'edition.json'),
      JSON.stringify({
        coreApiVersion: `^${CORE_API_VERSION}`,
        edition: 'enterprise',
        version: '1.0.0',
        branding: {
          appName: 'Acme AI',
          themeColor: '#ff0000',
          locale: 'zh-CN',
        },
        features: { voiceIO: true },
      }),
    );

    const config = await loadEdition({ projectRoot: dir, logger: silentLogger });
    assert.equal(config.edition, 'enterprise');
    assert.equal(config.version, '1.0.0');
    assert.equal(config.branding.appName, 'Acme AI');
    assert.equal(config.branding.themeColor, '#ff0000');
    assert.equal(config.branding.locale, 'zh-CN');
    assert.equal(config.features.voiceIO, true);
  });

  it('uses defaults for missing branding fields', async () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, 'edition.json'),
      JSON.stringify({
        edition: 'custom',
      }),
    );

    const config = await loadEdition({ projectRoot: dir, logger: silentLogger });
    assert.equal(config.branding.appName, 'Clowder AI');
    assert.equal(config.branding.themeColor, '#6366f1');
    assert.equal(config.branding.locale, 'en');
    assert.equal(config.identity.mode, 'no-auth');
  });

  it('rejects incompatible Core API version', async () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, 'edition.json'),
      JSON.stringify({
        coreApiVersion: '^99.0.0',
        edition: 'future',
      }),
    );

    await assert.rejects(
      () => loadEdition({ projectRoot: dir, logger: silentLogger }),
      (err) => {
        assert.ok(err.message.includes('Core API'));
        assert.ok(err.message.includes('99.0.0'));
        return true;
      },
    );
  });

  it('rejects absolute plugin path', async () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, 'edition.json'),
      JSON.stringify({
        coreApiVersion: `^${CORE_API_VERSION}`,
        edition: 'evil',
        editionMain: '/etc/passwd',
      }),
    );

    await assert.rejects(
      () => loadEdition({ projectRoot: dir, logger: silentLogger }),
      (err) => {
        assert.ok(err.message.includes('Absolute plugin paths'));
        return true;
      },
    );
  });

  it('rejects path traversal in plugin path', async () => {
    const dir = makeTmpDir();
    // Create a file outside the edition dir
    const parentFile = join(dir, '..', 'outside.js');
    writeFileSync(parentFile, 'module.exports = {}');
    dirs.push(parentFile); // clean up

    writeFileSync(
      join(dir, 'edition.json'),
      JSON.stringify({
        coreApiVersion: `^${CORE_API_VERSION}`,
        edition: 'evil',
        editionMain: '../outside.js',
      }),
    );

    await assert.rejects(
      () => loadEdition({ projectRoot: dir, logger: silentLogger }),
      (err) => {
        assert.ok(err.message.includes('escapes edition directory'), `Expected path escape error, got: ${err.message}`);
        return true;
      },
    );
  });

  it('discovers edition.json via EDITION_DIR env var', async () => {
    const projectRoot = makeTmpDir();
    const editionDir = join(projectRoot, 'editions', 'custom');
    mkdirSync(editionDir, { recursive: true });
    writeFileSync(
      join(editionDir, 'edition.json'),
      JSON.stringify({
        coreApiVersion: `^${CORE_API_VERSION}`,
        edition: 'custom-via-env',
        branding: { appName: 'EnvEdition' },
      }),
    );

    process.env.EDITION_DIR = editionDir;
    try {
      const config = await loadEdition({ projectRoot, logger: silentLogger });
      assert.equal(config.edition, 'custom-via-env');
      assert.equal(config.branding.appName, 'EnvEdition');
    } finally {
      delete process.env.EDITION_DIR;
    }
  });

  it('EDITION_DIR relative path resolves against projectRoot', async () => {
    const projectRoot = makeTmpDir();
    const editionDir = join(projectRoot, 'editions', 'rel');
    mkdirSync(editionDir, { recursive: true });
    writeFileSync(
      join(editionDir, 'edition.json'),
      JSON.stringify({
        coreApiVersion: `^${CORE_API_VERSION}`,
        edition: 'relative-edition',
      }),
    );

    process.env.EDITION_DIR = 'editions/rel';
    try {
      const config = await loadEdition({ projectRoot, logger: silentLogger });
      assert.equal(config.edition, 'relative-edition');
    } finally {
      delete process.env.EDITION_DIR;
    }
  });

  it('rejects nonexistent plugin path', async () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, 'edition.json'),
      JSON.stringify({
        coreApiVersion: `^${CORE_API_VERSION}`,
        edition: 'broken',
        editionMain: './nonexistent.js',
      }),
    );

    await assert.rejects(
      () => loadEdition({ projectRoot: dir, logger: silentLogger }),
      (err) => {
        assert.ok(err.message.includes('not found'));
        return true;
      },
    );
  });
});

// ─── DEFAULT_EDITION ─────────────────────────────────

describe('DEFAULT_EDITION', () => {
  it('has expected shape', () => {
    assert.equal(DEFAULT_EDITION.edition, 'community');
    assert.equal(DEFAULT_EDITION.identity.mode, 'no-auth');
    assert.equal(typeof DEFAULT_EDITION.coreApiVersion, 'string');
    assert.ok(DEFAULT_EDITION.coreApiVersion.startsWith('^'));
  });

  it('disables all optional features', () => {
    assert.equal(DEFAULT_EDITION.features.remoteSkillHub, false);
    assert.equal(DEFAULT_EDITION.features.voiceIO, false);
    assert.equal(DEFAULT_EDITION.features.agentTeams, false);
    assert.equal(DEFAULT_EDITION.features.werewolfGame, false);
  });
});

// ─── CORE_API_VERSION ────────────────────────────────

describe('CORE_API_VERSION', () => {
  it('is a valid semver string', () => {
    assert.match(CORE_API_VERSION, /^\d+\.\d+\.\d+$/);
  });
});
