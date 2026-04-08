import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadSidebar } from '../ThreadSidebar';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockApiFetch = vi.fn();
vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockStore: Record<string, unknown> = {
  threads: [],
  currentThreadId: 'default',
  setThreads: vi.fn(),
  setCurrentThread: vi.fn(),
  setCurrentProject: vi.fn(),
  isLoadingThreads: false,
  setLoadingThreads: vi.fn(),
  updateThreadTitle: vi.fn(),
  getThreadState: () => ({ catStatuses: {}, unreadCount: 0 }),
  updateThreadPin: vi.fn(),
  updateThreadFavorite: vi.fn(),
  threadStates: {},
};

vi.mock('@/stores/chatStore', () => {
  const hook = Object.assign(
    (selector?: (s: typeof mockStore) => unknown) => (selector ? selector(mockStore) : mockStore),
    { getState: () => mockStore },
  );
  return { useChatStore: hook };
});

vi.mock('../TaskPanel', () => ({ TaskPanel: () => null }));
vi.mock('../UserProfile', () => ({ UserProfile: () => null }));
vi.mock('../DirectoryPickerModal', () => ({
  DirectoryPickerModal: () => null,
}));

function jsonOk(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
}

describe('ThreadSidebar mobile auto-close', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalInnerWidth: number;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    originalInnerWidth = window.innerWidth;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockStore.currentThreadId = 'thread-1';
    mockStore.setCurrentThread = vi.fn();
    mockStore.setCurrentProject = vi.fn();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/threads') return jsonOk({ threads: [] });
      return jsonOk({});
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, writable: true });
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function flush() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  it('calls onClose after pressing new chat on mobile viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });

    const onClose = vi.fn();
    act(() => {
      root.render(React.createElement(ThreadSidebar, { onClose }));
    });
    await flush();

    const newBtn = container.querySelector('[data-testid="sidebar-new-chat"]');
    expect(newBtn).toBeTruthy();
    act(() => {
      (newBtn as HTMLButtonElement).click();
    });
    await flush();

    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockStore.setCurrentThread).toHaveBeenCalledWith('default');
    expect(mockStore.setCurrentProject).toHaveBeenCalledWith('default');
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose after pressing new chat on desktop viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });

    const onClose = vi.fn();
    act(() => {
      root.render(React.createElement(ThreadSidebar, { onClose }));
    });
    await flush();

    const newBtn = container.querySelector('[data-testid="sidebar-new-chat"]');
    expect(newBtn).toBeTruthy();
    act(() => {
      (newBtn as HTMLButtonElement).click();
    });
    await flush();

    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockStore.setCurrentThread).toHaveBeenCalledWith('default');
    expect(mockStore.setCurrentProject).toHaveBeenCalledWith('default');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses shared menu item classes for active and inactive sidebar actions', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    mockStore.currentThreadId = 'default';

    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();

    const newChatButton = container.querySelector('[data-testid="sidebar-new-chat"]');
    const modelsButton = container.querySelector('[data-testid="sidebar-menu-models"]');
    const missionControlButton = container.querySelector('[data-testid="sidebar-mission-control"]');

    expect(newChatButton).toBeTruthy();
    expect(newChatButton?.className).toContain('ui-menu-item');
    expect(newChatButton?.className).toContain('ui-menu-item-active');
    expect(modelsButton).toBeTruthy();
    expect(modelsButton?.className).toContain('ui-menu-item');
    expect(modelsButton?.className).toContain('ui-menu-item-inactive');
    expect(missionControlButton).toBeTruthy();
    expect(missionControlButton?.className).toContain('ui-menu-item');
    expect(missionControlButton?.className).toContain('ui-menu-item-inactive');
  });
});
