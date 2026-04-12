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
      ({
        jiuwenclaw: {
          id: 'jiuwenclaw',
          displayName: '九文爪',
          avatar: '/avatars/jiuwen.png',
          color: { primary: '#123456', secondary: '#abcdef' },
        },
        codex: {
          id: 'codex',
          displayName: '办公智能体',
          avatar: '/avatars/codex.png',
          color: { primary: '#654321', secondary: '#fedcba' },
        },
      })[id],
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

  it('prefers the latest assistant reply for sidebar avatar and description across refreshes', () => {
    const now = Date.now();

    act(() => {
      root.render(
        React.createElement(ThreadItem, {
          id: 'thread-2',
          title: '历史刷新',
          participants: [],
          lastActiveAt: now,
          isActive: false,
          onSelect: vi.fn(),
          threadState: {
            ...DEFAULT_THREAD_STATE,
            unreadCount: 0,
            targetCats: ['jiuwenclaw'],
            messages: [
              {
                id: 'msg-user',
                type: 'user',
                content: '请 @jiuwenclaw 处理这个会话',
                timestamp: now - 1_000,
              },
              {
                id: 'msg-assistant',
                type: 'assistant',
                catId: 'codex',
                content: '我来处理',
                timestamp: now,
              },
            ],
          },
        }),
      );
    });

    let img = container.querySelector('img[alt="办公智能体"]') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('/avatars/codex.png');
    expect(container.textContent).toContain('办公智能体');

    act(() => {
      root.render(
        React.createElement(ThreadItem, {
          id: 'thread-2',
          title: '历史刷新',
          participants: [],
          lastActiveAt: now,
          isActive: false,
          onSelect: vi.fn(),
          threadState: {
            ...DEFAULT_THREAD_STATE,
            unreadCount: 0,
            targetCats: [],
            messages: [
              {
                id: 'msg-user',
                type: 'user',
                content: '请 @jiuwenclaw 处理这个会话',
                timestamp: now - 1_000,
              },
              {
                id: 'msg-assistant',
                type: 'assistant',
                catId: 'codex',
                content: '我来处理',
                timestamp: now,
              },
            ],
          },
        }),
      );
    });

    img = container.querySelector('img[alt="办公智能体"]') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('/avatars/codex.png');
    expect(container.textContent).toContain('办公智能体');
    expect(container.textContent).not.toContain('九文爪');
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
