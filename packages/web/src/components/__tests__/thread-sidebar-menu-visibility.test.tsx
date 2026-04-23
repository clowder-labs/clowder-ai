/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadSidebar } from '@/components/ThreadSidebar/ThreadSidebar';
import { useChatStore } from '@/stores/chatStore';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(() => Promise.resolve({ ok: false })),
}));

vi.mock('@/components/UserProfile', () => ({
  UserProfile: () => React.createElement('div', { 'data-testid': 'user-profile-stub' }),
}));

vi.mock('@/components/AppModal', () => ({
  AppModal: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('@/components/ThreadSidebar/DirectoryPickerModal', () => ({
  DirectoryPickerModal: () => null,
}));

vi.mock('@/components/ThreadSidebar/SectionGroup', () => ({
  SectionGroup: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
}));

vi.mock('@/components/ThreadSidebar/ThreadItem', () => ({
  ThreadItem: () => null,
}));

vi.mock('@/components/ThreadSidebar/use-collapse-state', () => ({
  useCollapseState: () => ({
    isCollapsed: () => false,
    toggleGroup: vi.fn(),
  }),
}));

vi.mock('@/components/ThreadSidebar/use-project-pins', () => ({
  useProjectPins: () => ({
    pinnedProjects: new Set<string>(),
    toggleProjectPin: vi.fn(),
  }),
}));

describe('ThreadSidebar menu visibility', () => {
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
    useChatStore.setState({
      threads: [],
      currentThreadId: 'default',
      isLoadingThreads: false,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the scheduled tasks menu entry hidden', async () => {
    await act(async () => {
      root.render(React.createElement(ThreadSidebar));
    });

    const scheduledTasksButton = container.querySelector(
      '[data-testid="sidebar-menu-scheduled-tasks"]',
    ) as HTMLButtonElement | null;

    expect(scheduledTasksButton).not.toBeNull();
    expect(scheduledTasksButton?.hidden).toBe(true);
  });
});
