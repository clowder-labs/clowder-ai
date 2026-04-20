/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/utils/api-client';
import { FileBlock } from '../rich/FileBlock';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(async () => ({ ok: true })),
}));

describe('FileBlock open action', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.mocked(apiFetch).mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders workspace action and calls workspace open API', async () => {
    act(() => {
      root.render(
        <FileBlock
          block={{
            id: 'file-1',
            kind: 'file',
            v: 1,
            url: '/api/workspace/download?worktreeId=wt-1&path=output%2Fdemo.pptx',
            fileName: 'demo.pptx',
            worktreeId: 'wt-1',
            workspacePath: 'output/demo.pptx',
          }}
        />,
      );
    });

    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(container.textContent).toContain('位置: output/demo.pptx');

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(apiFetch).toHaveBeenCalledWith('/api/workspace/open', expect.objectContaining({ method: 'POST' }));
    const [, init] = vi.mocked(apiFetch).mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      worktreeId: 'wt-1',
      path: 'output/demo.pptx',
    });
  });

  it('renders download link for uploaded attachments', () => {
    const html = renderToStaticMarkup(
      <FileBlock
        block={{
          id: 'file-2',
          kind: 'file',
          v: 1,
          url: '/uploads/demo.xlsx',
          fileName: 'demo.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }}
      />,
    );

    expect(html).toContain('demo.xlsx');
    expect(html).toContain('<a');
    expect(html).not.toContain('<button');
  });
});
