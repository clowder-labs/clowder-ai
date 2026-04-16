/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import './helpers/setup-cat-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { stripLeadingDirectCatMention, toStoredToolEvent } = await import(
  '../dist/domains/cats/services/agents/routing/route-helpers.js'
);

describe('route-helpers', () => {
  it('strips the current cat direct mention from the start of a user task', () => {
    assert.equal(stripLeadingDirectCatMention('@office 帮我做一页 PPT', 'jiuwenclaw'), '帮我做一页 PPT');
    assert.equal(stripLeadingDirectCatMention('@office，帮我做一页 PPT', 'jiuwenclaw'), '帮我做一页 PPT');
  });

  it('does not strip mentions that are not direct leading addresses', () => {
    assert.equal(
      stripLeadingDirectCatMention('请 @office 帮我做一页 PPT', 'jiuwenclaw'),
      '请 @office 帮我做一页 PPT',
    );
  });
});

describe('toStoredToolEvent', () => {
  it('preserves toolCallId in tool_use event', () => {
    const msg = {
      type: 'tool_use',
      catId: 'office',
      toolName: 'Read',
      toolInput: { file_path: '/test.txt' },
      toolCallId: 'call-abc123',
      timestamp: 1709500000000,
    };
    const result = toStoredToolEvent(msg);
    assert.ok(result);
    assert.strictEqual(result.type, 'tool_use');
    assert.strictEqual(result.toolCallId, 'call-abc123');
    assert.ok(result.label.includes('Read'));
  });

  it('preserves toolCallId in tool_result event', () => {
    const msg = {
      type: 'tool_result',
      catId: 'office',
      content: 'file contents here',
      toolCallId: 'call-abc123',
      timestamp: 1709500001000,
    };
    const result = toStoredToolEvent(msg);
    assert.ok(result);
    assert.strictEqual(result.type, 'tool_result');
    assert.strictEqual(result.toolCallId, 'call-abc123');
  });

  it('gracefully handles missing toolCallId (backward compat)', () => {
    const msg = {
      type: 'tool_use',
      catId: 'office',
      toolName: 'Bash',
      timestamp: 1709500002000,
    };
    const result = toStoredToolEvent(msg);
    assert.ok(result);
    assert.strictEqual(result.toolCallId, undefined);
    // Should not have toolCallId property set to undefined
    assert.strictEqual('toolCallId' in result, false);
  });

  it('pairs tool_use and tool_result by same toolCallId', () => {
    const toolCallId = 'call-pair-test';
    const useMsg = {
      type: 'tool_use',
      catId: 'office',
      toolName: 'Write',
      toolCallId,
      timestamp: 1709500003000,
    };
    const resultMsg = {
      type: 'tool_result',
      catId: 'office',
      content: 'written successfully',
      toolCallId,
      timestamp: 1709500004000,
    };
    const useEvent = toStoredToolEvent(useMsg);
    const resultEvent = toStoredToolEvent(resultMsg);
    assert.ok(useEvent);
    assert.ok(resultEvent);
    assert.strictEqual(useEvent.toolCallId, resultEvent.toolCallId);
  });
});
