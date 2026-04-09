/**
 * StubModelSource unit tests — Core fallback for IModelSource contract.
 *
 * [宪宪/Opus-46🐾] F140 Phase A — AC-A5
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StubModelSource } from '../dist/edition/stubs/stub-model-source.js';

describe('StubModelSource', () => {
  const stub = new StubModelSource();

  it('has id "stub"', () => {
    assert.equal(stub.id, 'stub');
  });

  it('listModels returns empty array', async () => {
    const models = await stub.listModels();
    assert.deepEqual(models, []);
  });

  it('resolveRuntimeConfig throws for any model', async () => {
    await assert.rejects(
      () => stub.resolveRuntimeConfig('unknown-model'),
      (err) => {
        assert.ok(err.message.includes('unknown-model'));
        assert.ok(err.message.includes('StubModelSource'));
        return true;
      },
    );
  });
});
