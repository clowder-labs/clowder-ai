import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillsPanel } from '@/components/SkillsPanel';
import { ToastContainer } from '@/components/ToastContainer';
import { useToastStore } from '@/stores/toastStore';

vi.mock('@/components/HubCapabilityTab', () => ({
  HubCapabilityTab: ({ onImport }: { onImport?: () => void }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'installed-panel-import',
        onClick: onImport,
      },
      '导入',
    ),
}));

vi.mock('@/components/HubSkillsTab', () => ({
  HubSkillsTab: () => React.createElement('div', { 'data-testid': 'market-panel' }),
}));

vi.mock('@/components/UploadSkillModal', () => ({
  UploadSkillModal: ({
    open,
    onSuccess,
  }: {
    open: boolean;
    onSuccess: () => void;
  }) =>
    open
      ? React.createElement(
          'button',
          {
            type: 'button',
            onClick: onSuccess,
          },
          '模拟上传成功',
        )
      : null,
}));

describe('SkillsPanel global upload toast', () => {
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
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('routes upload success feedback through the global toast store', async () => {
    await act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(SkillsPanel),
          React.createElement(ToastContainer),
        ),
      );
    });

    const importButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('导入'),
    );
    expect(importButton).toBeDefined();

    await act(async () => {
      importButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const successButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('模拟上传成功'),
    );
    expect(successButton).toBeDefined();

    await act(async () => {
      successButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(
      useToastStore
        .getState()
        .toasts.some((toast) => toast.type === 'success' && toast.title === '上传成功' && toast.message === '技能上传成功'),
    ).toBe(true);
  });
});
