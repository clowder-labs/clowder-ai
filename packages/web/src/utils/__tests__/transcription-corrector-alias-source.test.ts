/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('@office-claw/shared');
  vi.resetModules();
});

describe('transcription-corrector alias source', () => {
  it('follows CAT_CONFIGS mentionPatterns dynamically', async () => {
    vi.doMock('@office-claw/shared', async () => {
      const actual = await vi.importActual<typeof import('@office-claw/shared')>('@office-claw/shared');
      const codexPatterns = [...actual.CAT_CONFIGS.codex.mentionPatterns, '@测试Codex别名'];
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
    expect(correctTranscription('at测试Codex别名 出来一下')).toBe('@测试Codex别名 出来一下');
  });
});
