/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('@cat-cafe/shared');
  vi.resetModules();
});

describe('transcription-corrector alias source', () => {
  it('follows CAT_CONFIGS mentionPatterns dynamically', async () => {
    vi.doMock('@cat-cafe/shared', async () => {
      const actual = await vi.importActual<typeof import('@cat-cafe/shared')>('@cat-cafe/shared');
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
