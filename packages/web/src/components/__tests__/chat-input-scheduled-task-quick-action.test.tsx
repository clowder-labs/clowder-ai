/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput, threadDrafts } from '@/components/ChatInput';
import { QUICK_ACTIONS } from '@/config/quick-actions';
import { useChatStore } from '@/stores/chatStore';

vi.mock('@/components/icons/SendIcon', () => ({
  SendIcon: () => React.createElement('span', null, 'send'),
}));
vi.mock('@/components/icons/LoadingIcon', () => ({
  LoadingIcon: () => React.createElement('span', null, 'loading'),
}));
vi.mock('@/components/icons/AttachIcon', () => ({
  AttachIcon: () => React.createElement('span', null, 'attach'),
}));
vi.mock('@/components/ImagePreview', () => ({ ImagePreview: () => null }));
vi.mock('@/utils/compressImage', () => ({
  compressImage: (f: File) => Promise.resolve(f),
}));
vi.mock('@/hooks/useCatData', () => ({
  useCatData: () => ({
    cats: [],
    isLoading: false,
    getCatById: () => undefined,
    getCatsByBreed: () => new Map(),
  }),
}));
vi.mock('@/utils/skill-options-cache', () => ({
  fetchSkillOptionsWithCache: () => Promise.resolve([]),
  seedSkillOptionsCache: vi.fn(),
}));

const scheduledTaskAction = QUICK_ACTIONS.find((action) => action.icon === '/icons/scheduled-task.svg');

if (!scheduledTaskAction) {
  throw new Error('Missing scheduled task quick action config');
}

function flush() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ChatInput scheduled task quick action injection', () => {
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
    threadDrafts.clear();
    useChatStore.setState({
      activeInvocations: {},
      hasActiveInvocation: false,
      targetCats: [],
      pendingChatInsert: null,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    threadDrafts.clear();
    useChatStore.setState({ pendingChatInsert: null });
  });

  it('expands the scheduled-task quick prompts after pending insert without auto-sending', async () => {
    const onSend = vi.fn();
    const token = `[[quick_action:${scheduledTaskAction.label}]] `;

    useChatStore.setState({
      pendingChatInsert: {
        threadId: 'thread-1',
        text: token,
      },
    });

    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend }));
    });
    await flush();

    const quickActionToken = container.querySelector('[data-token-type="quick-action"]') as HTMLElement | null;
    expect(quickActionToken?.textContent).toContain(scheduledTaskAction.label);
    expect(useChatStore.getState().pendingChatInsert).toBeNull();
    expect(onSend).not.toHaveBeenCalled();

    for (const prompt of scheduledTaskAction.prompts) {
      expect(container.textContent).toContain(prompt);
    }
  });
});
