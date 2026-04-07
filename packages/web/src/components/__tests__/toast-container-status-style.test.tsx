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

  it('uses global status backgrounds without left icon or left border accent', async () => {
    await act(async () => {
      root.render(React.createElement(ToastContainer));
    });

    const alerts = Array.from(document.body.querySelectorAll('[role="alert"]'));
    expect(alerts).toHaveLength(2);

    const successToast = alerts.find((node) => node.textContent?.includes('安装成功'));
    const errorToast = alerts.find((node) => node.textContent?.includes('安装失败'));

    expect(successToast?.className).toContain('bg-[var(--state-success-surface)]');
    expect(errorToast?.className).toContain('bg-[var(--state-error-surface)]');
    expect(successToast?.className).not.toContain('border-l-4');
    expect(errorToast?.className).not.toContain('border-l-4');
    expect(successToast?.className).toContain('text-black');
    expect(successToast?.textContent).not.toContain('釗');
    expect(errorToast?.textContent).not.toContain('釗');
    const closeButton = successToast?.querySelector('button');
    expect(closeButton?.className).toContain('text-gray-300');
  });
});
