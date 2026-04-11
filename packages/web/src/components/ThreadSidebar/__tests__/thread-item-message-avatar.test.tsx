/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THREAD_STATE } from '@/stores/chat-types';
import { ThreadItem } from '../ThreadItem';

vi.mock('@/hooks/useCatData', () => ({
  useCatData: () => ({
    cats: [],
    getCatById: (id: string) =>
      id === 'jiuwenclaw'
        ? {
            id: 'jiuwenclaw',
            displayName: '九文爪',
            avatar: '/avatars/jiuwen.png',
            color: { primary: '#123456', secondary: '#abcdef' },
          }
        : undefined,
  }),
}));

vi.mock('@/utils/api-client', () => ({
  API_URL: 'http://localhost:3102',
}));

describe('ThreadItem message avatar', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function flush() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  it('shows avatar from mentioned cat id in thread messages when thread has no participants yet', () => {
    act(() => {
      root.render(
        React.createElement(ThreadItem, {
          id: 'thread-1',
          title: '新线程',
          participants: [],
          lastActiveAt: Date.now(),
          isActive: false,
          onSelect: vi.fn(),
          threadState: {
            ...DEFAULT_THREAD_STATE,
            unreadCount: 0,
            messages: [
              {
                id: 'msg-1',
                type: 'user',
                content: '请 @jiuwenclaw 处理这个会话',
                timestamp: Date.now(),
              },
            ],
          },
        }),
      );
    });

    const img = container.querySelector('img[alt="九文爪"]') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('/avatars/jiuwen.png');
  });

  it('renders a 32x32 sidebar avatar and keeps png images proportionally scaled', () => {
    act(() => {
      root.render(
        React.createElement(ThreadItem, {
          id: 'thread-1',
          title: 'avatar-size-check',
          participants: ['jiuwenclaw'],
          lastActiveAt: Date.now(),
          isActive: false,
          onSelect: vi.fn(),
          threadState: DEFAULT_THREAD_STATE,
        }),
      );
    });

    const avatarShell = container.querySelector('.answer-avatar') as HTMLDivElement | null;
    const avatarImage = container.querySelector('.ui-avatar-image') as HTMLImageElement | null;

    expect(avatarShell).toBeTruthy();
    expect(avatarShell?.style.width).toBe('32px');
    expect(avatarShell?.style.height).toBe('32px');
    expect(avatarImage).toBeTruthy();
    expect(avatarImage?.className).toContain('object-contain');
  });

  it('uses the shared tooltip for the thread title instead of a native title attribute', async () => {
    act(() => {
      root.render(
        React.createElement(ThreadItem, {
          id: 'thread-2',
          title: 'very-long-thread-title-for-tooltip',
          participants: [],
          lastActiveAt: Date.now(),
          isActive: false,
          onSelect: vi.fn(),
          threadState: DEFAULT_THREAD_STATE,
        }),
      );
    });
    await flush();

    const row = container.querySelector('.ui-thread-item') as HTMLDivElement | null;
    const title = container.querySelector('.ui-thread-title') as HTMLSpanElement | null;
    expect(row).toBeTruthy();
    expect(row?.getAttribute('title')).toBeNull();
    expect(title).toBeTruthy();

    Object.defineProperty(title!, 'clientWidth', { configurable: true, value: 80 });
    Object.defineProperty(title!, 'scrollWidth', { configurable: true, value: 220 });

    act(() => {
      title?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    await flush();

    const tooltip = document.body.querySelector('[role="tooltip"]') as HTMLDivElement | null;
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).toContain('very-long-thread-title-for-tooltip');
  });
});
