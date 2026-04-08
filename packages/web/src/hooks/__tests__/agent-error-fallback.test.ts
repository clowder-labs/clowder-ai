import { describe, expect, it } from 'vitest';
import {
  MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE,
  getFriendlyAgentErrorMessage,
  getSensitiveInputErrorToastContent,
  isSensitiveInputAgentError,
} from '@/hooks/agent-error-fallback';

describe('agent sensitive-input error classification', () => {
  it('detects structured ModelArts sensitive-input errors', () => {
    expect(
      isSensitiveInputAgentError({
        errorCode: MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE,
        error: 'Input text May contain sensitive information, please try again.',
      }),
    ).toBe(true);
  });

  it('detects raw upstream payloads with smart quotes', () => {
    expect(
      isSensitiveInputAgentError({
        error:
          "{‘error’: {‘code’: ‘ModelArts.81011’, ‘message’: ‘Input text May contain sensitive information, please try again.’}}",
      }),
    ).toBe(true);
  });

  it('returns sensitive-input specific bubble copy and toast copy', () => {
    expect(
      getFriendlyAgentErrorMessage({
        errorCode: MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE,
        error: 'Input text May contain sensitive information, please try again.',
      }),
    ).toContain('重新打开一个新会话');

    expect(getSensitiveInputErrorToastContent()).toEqual({
      title: '检测到敏感词',
      message: '当前对话触发了敏感词校验，请重新打开一个新会话后再试。',
    });
  });
});
