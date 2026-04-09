import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('@clowder/shared');
  vi.resetModules();
});

describe('transcription-corrector alias source', () => {
  it('follows CAT_CONFIGS mentionPatterns dynamically', async () => {
    vi.doMock('@clowder/shared', async () => {
      const actual = await vi.importActual<typeof import('@clowder/shared')>('@clowder/shared');
      const codexPatterns = [...actual.CAT_CONFIGS.codex.mentionPatterns, '@测试缅因别名'];
      return {
        ...actual,
        CAT_CONFIGS: {
          ...actual.CAT_CONFIGS,
          codex: {
            ...actual.CAT_CONFIGS.codex,
            mentionPatterns: codexPatterns,
          },
        },
      };
    });

    const { correctTranscription } = await import('@/utils/transcription-corrector');
    expect(correctTranscription('at测试缅因别名 出来一下')).toBe('@测试缅因别名 出来一下');
  });
});
