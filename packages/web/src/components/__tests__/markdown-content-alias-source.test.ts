/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis as Record<string, unknown>, { React });

afterEach(() => {
  vi.doUnmock('@cat-cafe/shared');
  vi.resetModules();
});

describe('MarkdownContent alias source', () => {
  it('follows CAT_CONFIGS mentionPatterns dynamically', async () => {
    vi.doMock('@cat-cafe/shared', async () => {
      const actual = await vi.importActual<typeof import('@cat-cafe/shared')>('@cat-cafe/shared');
      const opusPatterns = [...actual.CAT_CONFIGS.opus.mentionPatterns, '@测试布偶别名'];
      return {
        ...actual,
        CAT_CONFIGS: {
          ...actual.CAT_CONFIGS,
          opus: {
            ...actual.CAT_CONFIGS.opus,
            mentionPatterns: opusPatterns,
          },
        },
      };
    });

    // Must also re-import mention-highlight (which reads CAT_CONFIGS at module init)
    await import('@/lib/mention-highlight');
    const { MarkdownContent } = await import('@/components/MarkdownContent');
    const html = renderToStaticMarkup(React.createElement(MarkdownContent, { content: '@测试布偶别名 你先看下' }));
    // Dynamic colors now use inline style with hex values (not Tailwind classes)
    expect(html).toContain('color:#9B7EBD');
  });
});
