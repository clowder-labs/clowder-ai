import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ToastContainer } from '@/components/ToastContainer';
import { useToastStore } from '@/stores/toastStore';

describe('ToastContainer status styling', () => {
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
    useToastStore.setState({
      toasts: [
        {
          id: 'toast-success',
          type: 'success',
          title: '安装成功',
          message: 'skill-a 已安装',
          duration: 0,
          createdAt: Date.now(),
        },
        {
          id: 'toast-error',
          type: 'error',
          title: '安装失败',
          message: '权限不足',
          duration: 0,
          createdAt: Date.now() + 1,
        },
      ],
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useToastStore.setState({ toasts: [] });
  });

  it('uses the updated global toast card layout and status surfaces', async () => {
    await act(async () => {
      root.render(React.createElement(ToastContainer));
    });

    const alerts = Array.from(document.body.querySelectorAll('[role="alert"]'));
    expect(alerts).toHaveLength(2);

    const successToast = alerts.find((node) => node.textContent?.includes('安装成功'));
    const errorToast = alerts.find((node) => node.textContent?.includes('安装失败'));

    expect(successToast?.className).toContain('bg-[var(--state-success-surface)]');
    expect(errorToast?.className).toContain('bg-[var(--state-error-surface)]');
    expect(successToast?.className).toContain('border-[var(--state-success-surface)]');
    expect(errorToast?.className).toContain('border-[var(--state-error-surface)]');
    expect(successToast?.className).toContain('box-border');
    expect(successToast?.className).toContain('rounded-[8px]');
    expect(successToast?.className).toContain('shadow-[-2px_0px_12px_0px_rgba(0,0,0,0.16)]');
    expect(successToast?.className).toContain('px-4');
    expect(successToast?.className).toContain('py-2');
    expect(successToast?.className).toContain('text-black');
    expect(successToast?.textContent).not.toContain('⚠');
    expect(errorToast?.textContent).not.toContain('⚠');

    const contentRow = successToast?.firstElementChild as HTMLDivElement | null;
    expect(contentRow?.className).toContain('items-start');
    expect(contentRow?.className).toContain('gap-4');

    const closeButton = successToast?.querySelector('button');
    expect(closeButton?.className).toContain('text-gray-300');
  });
});
