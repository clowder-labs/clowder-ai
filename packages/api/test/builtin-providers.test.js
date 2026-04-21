import assert from 'node:assert/strict';
import { afterEach } from 'node:test';
import test from 'node:test';
import { ProviderPluginRegistry } from '../../core/dist/index.js';
import { BUILTIN_PLUGINS } from '../dist/config/plugins/builtin-providers.js';
import { resetPluginRegistry } from '../dist/config/plugins/plugin-registry-singleton.js';

afterEach(() => {
  resetPluginRegistry();
});

test('BUILTIN_PLUGINS register the relayclaw binding with openai compatibility', () => {
  const registry = new ProviderPluginRegistry();
  for (const plugin of BUILTIN_PLUGINS) {
    registry.register(plugin);
  }

  assert.equal(registry.resolveBuiltinClient('relayclaw'), 'openai');
  assert.equal(registry.resolveExpectedProtocol('relayclaw'), 'openai');
});
