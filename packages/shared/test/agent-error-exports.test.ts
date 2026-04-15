import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MODEL_ARTS_RATE_LIMIT_ERROR_CODE,
  MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE,
  getRateLimitMessage,
  isRateLimitError,
  isSensitiveInputError,
} from '../src/index.js';

describe('shared agent error exports', () => {
  it('exports common error helpers for frontend reuse', () => {
    assert.equal(MODEL_ARTS_RATE_LIMIT_ERROR_CODE, 'ModelArts.81101');
    assert.equal(MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE, 'ModelArts.81011');
    assert.equal(getRateLimitMessage(), '当前请求较多，模型暂时限流，请稍后重试。');
    assert.equal(isRateLimitError({ errorCode: MODEL_ARTS_RATE_LIMIT_ERROR_CODE }), true);
    assert.equal(
      isSensitiveInputError({
        errorCode: MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE,
        error: 'Input text May contain sensitive information, please try again.',
      }),
      true,
    );
  });
});
