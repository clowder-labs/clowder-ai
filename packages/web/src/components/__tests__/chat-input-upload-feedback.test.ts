/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '@/components/ChatInput';
import { useToastStore } from '@/stores/toastStore';

vi.mock('@/components/icons/SendIcon', () => ({
  SendIcon: () => React.createElement('span', null, 'send'),
}));
vi.mock('@/components/icons/LoadingIcon', () => ({
  LoadingIcon: () => React.createElement('span', null, 'loading'),
}));
vi.mock('@/components/icons/AttachIcon', () => ({
  AttachIcon: () => React.createElement('span', null, 'attach'),
}));
vi.mock('@/components/ImagePreview', () => ({
  ImagePreview: () => null,
}));
vi.mock('@/utils/compressImage', () => ({
  compressImage: (f: File) => Promise.resolve(f),
}));

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  delete (globalThis as { React?: typeof React }).React;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(props: Partial<React.ComponentProps<typeof ChatInput>> = {}) {
  const defaults = { onSend: vi.fn(), disabled: false };
  act(() => {
    root.render(React.createElement(ChatInput, { ...defaults, ...props }));
  });
  return defaults;
}

describe('ChatInput upload feedback', () => {
  it('shows uploading hint while image request is in progress', () => {
    render({ uploadStatus: 'uploading' });
    expect(container.textContent).toContain('文件上传中，请稍候...');
  });

  it('shows visible error hint when image send fails', () => {
    render({ uploadStatus: 'failed', uploadError: '上传超时' });
    expect(container.textContent).toContain('文件发送失败：上传超时');
  });

  it('blocks oversized files (>10MB) and shows a toast', () => {
    render();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'oversized.pdf', {
      type: 'application/pdf',
    });

    Object.defineProperty(fileInput!, 'files', {
      configurable: true,
      value: [oversized],
    });

    act(() => {
      fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const latestToast = useToastStore.getState().toasts.at(-1);
    expect(latestToast?.title).toBe('上传失败');
    expect(latestToast?.message).toContain('最大支持 10MB');

  });

  it('blocks selecting more than 5 attachments and shows a toast', () => {
    render();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const files = Array.from({ length: 6 }, (_, index) =>
      new File([`file-${index}`], `file-${index}.pdf`, {
        type: 'application/pdf',
      }),
    );

    Object.defineProperty(fileInput!, 'files', {
      configurable: true,
      value: files,
    });

    act(() => {
      fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const latestToast = useToastStore.getState().toasts.at(-1);
    expect(latestToast?.title).toBe('附件数量已达上限');
    expect(latestToast?.message).toContain('最多支持选择 5 个附件');
  });
});
