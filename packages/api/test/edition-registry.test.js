import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EditionRegistryImpl } from '../dist/edition/types.js';

// ─── Mock sources / adapters ─────────────────────────

function mockModelSource(id = 'mock-model') {
  return {
    id,
    async listModels() { return []; },
    async resolveRuntimeConfig() { return { baseUrl: '', apiKey: '', model: '' }; },
  };
}

function mockSkillSource(id = 'mock-skill') {
  return {
    id,
    async search() { return []; },
    async install() {},
    async uninstall() {},
  };
}

function mockConnector(id = 'mock-connector') {
  return {
    id,
    displayName: id,
    async initialize() {},
    async handleInbound() {},
    async sendOutbound() {},
    async shutdown() {},
    async health() { return { status: 'ok' }; },
    capabilities() { return { supportsInbound: true, supportsOutbound: true, supportedMessageTypes: [] }; },
  };
}

// ─── Tests ───────────────────────────────────────────

describe('EditionRegistryImpl', () => {
  it('starts empty', () => {
    const reg = new EditionRegistryImpl();
    assert.equal(reg.modelSources.length, 0);
    assert.equal(reg.skillSources.length, 0);
    assert.equal(reg.connectors.length, 0);
  });

  it('adds and lists model sources', () => {
    const reg = new EditionRegistryImpl();
    reg.addModelSource(mockModelSource('a'));
    reg.addModelSource(mockModelSource('b'));
    assert.equal(reg.modelSources.length, 2);
    assert.equal(reg.modelSources[0].id, 'a');
    assert.equal(reg.modelSources[1].id, 'b');
  });

  it('adds and lists skill sources', () => {
    const reg = new EditionRegistryImpl();
    reg.addSkillSource(mockSkillSource('s1'));
    assert.equal(reg.skillSources.length, 1);
    assert.equal(reg.skillSources[0].id, 's1');
  });

  it('adds and lists connectors', () => {
    const reg = new EditionRegistryImpl();
    reg.addConnector(mockConnector('c1'));
    reg.addConnector(mockConnector('c2'));
    assert.equal(reg.connectors.length, 2);
  });

  it('freeze prevents further registration', () => {
    const reg = new EditionRegistryImpl();
    reg.addModelSource(mockModelSource());
    reg.freeze();

    assert.throws(
      () => reg.addModelSource(mockModelSource('new')),
      { message: /frozen/ },
    );
    assert.throws(
      () => reg.addSkillSource(mockSkillSource('new')),
      { message: /frozen/ },
    );
    assert.throws(
      () => reg.addConnector(mockConnector('new')),
      { message: /frozen/ },
    );
  });

  it('freeze makes arrays immutable', () => {
    const reg = new EditionRegistryImpl();
    reg.addModelSource(mockModelSource());
    reg.freeze();

    // Attempting to push directly on the readonly array should throw
    assert.throws(() => {
      /** @type {any} */ (reg.modelSources).push(mockModelSource('hack'));
    });
  });

  it('counts survive freeze', () => {
    const reg = new EditionRegistryImpl();
    reg.addModelSource(mockModelSource('m1'));
    reg.addSkillSource(mockSkillSource('s1'));
    reg.addConnector(mockConnector('c1'));
    reg.addConnector(mockConnector('c2'));
    reg.freeze();

    assert.equal(reg.modelSources.length, 1);
    assert.equal(reg.skillSources.length, 1);
    assert.equal(reg.connectors.length, 2);
  });
});
