import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyError, getFriendlyAgentErrorMessage } from '../src/agent-error-transform.js';

describe('classifyError', () => {
  it('classifies timeout errors', () => {
    assert.equal(classifyError('响应超时'), 'timeout');
    assert.equal(classifyError('Request timed out'), 'timeout');
    assert.equal(classifyError('Connection timeout'), 'timeout');
  });

  it('classifies connection errors', () => {
    assert.equal(classifyError('connection failed'), 'connection');
    assert.equal(classifyError('connection closed unexpectedly'), 'connection');
    assert.equal(classifyError('WebSocket connection closed'), 'connection');
  });

  it('classifies config errors', () => {
    assert.equal(classifyError('Invalid API key'), 'config');
    assert.equal(classifyError('WebSocket URL is not configured'), 'config');
    assert.equal(classifyError('provider profile is not configured'), 'config');
    assert.equal(classifyError('model profile is missing'), 'config');
  });

  it('classifies abrupt exit errors', () => {
    assert.equal(classifyError('CLI 异常退出'), 'abrupt_exit');
    assert.equal(classifyError('subprocess exited unexpectedly'), 'abrupt_exit');
    assert.equal(classifyError('abnormal exit'), 'abrupt_exit');
  });

  it('classifies max iterations errors', () => {
    assert.equal(classifyError('max iterations reached'), 'max_iterations');
    assert.equal(classifyError('max_iterations_reached'), 'max_iterations');
  });

  it('classifies sensitive input errors', () => {
    assert.equal(
      classifyError('ModelArts.81011: Input text May contain sensitive information'),
      'sensitive_input',
    );
  });

  it('classifies temporary model rate limit errors', () => {
    assert.equal(
      classifyError(
        "[181001] model call failed, reason: openAI API async stream error: Error code: 429 - {'error': {'code': 'ModelArts.81101', 'message': 'Too many requests, the rate limit is 2000000 tokens per minute.', 'type': 'TooManyRequests'}, 'error_code': 'ModelArts.81101', 'error_msg': 'Too many requests, the rate limit is 2000000 tokens per minute.'}",
      ),
      'rate_limit',
    );
  });

  it('classifies daily quota exhaustion errors', () => {
    assert.equal(
      classifyError(
        "[181001] model call failed, reason: openAI API async stream error: Error code: 429 - {'error': {'code': 'APIG.0308', 'message': 'Daily quota exhausted', 'type': 'TooManyRequests'}, 'error_code': 'APIG.0308', 'error_msg': 'Daily quota exhausted'}",
      ),
      'daily_quota',
    );
  });

  it('classifies unknown errors', () => {
    assert.equal(classifyError('Something went wrong'), 'unknown');
    assert.equal(classifyError('Random error message'), 'unknown');
  });
});

describe('getFriendlyAgentErrorMessage', () => {
  it('generates friendly message for timeout errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      catId: 'jiuwen',
      error: '响应超时',
      metadata: { provider: 'anthropic', model: 'claude-3' },
    });
    assert.match(msg, /响应超时/);
  });

  it('generates friendly message for connection errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      catId: 'codex',
      error: 'connection failed',
      metadata: { provider: 'openai', model: 'gpt-4' },
    });
    assert.match(msg, /连接不稳定/);
  });

  it('generates friendly message for config errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      catId: 'jiuwen',
      error: 'Invalid API key',
    });
    assert.match(msg, /API Key/);
  });

  it('generates friendly message for sensitive input errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      catId: 'jiuwen',
      error: 'ModelArts.81011: Input text May contain sensitive information',
    });
    assert.match(msg, /敏感词/);
  });

  it('generates retry guidance for temporary model rate limit errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      catId: 'jiuwen',
      error:
        "[181001] model call failed, reason: openAI API async stream error: Error code: 429 - {'error': {'code': 'ModelArts.81101', 'message': 'Too many requests, the rate limit is 2000000 tokens per minute.', 'type': 'TooManyRequests'}, 'error_code': 'ModelArts.81101', 'error_msg': 'Too many requests, the rate limit is 2000000 tokens per minute.'}",
      errorCode: 'ModelArts.81101',
    });
    assert.match(msg, /当前请求较多/);
    assert.match(msg, /请稍后重试/);
  });

  it('generates friendly message for daily quota exhaustion errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      catId: 'jiuwen',
      error:
        "[181001] model call failed, reason: openAI API async stream error: Error code: 429 - {'error': {'code': 'APIG.0308', 'message': 'Daily quota exhausted', 'type': 'TooManyRequests'}, 'error_code': 'APIG.0308', 'error_msg': 'Daily quota exhausted'}",
      errorCode: 'APIG.0308',
    });
    assert.match(msg, /免费模型使用额度已用尽/);
    assert.match(msg, /华为云MaaS模型服务/);
  });

  it('truncates long error messages', () => {
    const longError = 'x'.repeat(2000);
    const msg = getFriendlyAgentErrorMessage({
      catId: 'jiuwen',
      error: longError,
    });
    // Should not contain the full 2000 chars
    assert.ok(msg.length < longError.length);
  });

  it('handles missing error field', () => {
    const msg = getFriendlyAgentErrorMessage({
      catId: 'jiuwen',
    });
    assert.match(msg, /没有顺利完成/);
  });

  it('handles empty error string', () => {
    const msg = getFriendlyAgentErrorMessage({
      catId: 'jiuwen',
      error: '',
    });
    assert.match(msg, /没有顺利完成/);
  });

  it('generates friendly message for abrupt exit errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      catId: 'jiuwen',
      error: 'CLI 异常退出',
    });
    assert.match(msg, /响应中断/);
  });

  it('generates friendly message for max iterations errors', () => {
    const msg = getFriendlyAgentErrorMessage({
      catId: 'jiuwen',
      error: 'max iterations reached',
    });
    assert.match(msg, /最大思考轮数/);
  });
});
