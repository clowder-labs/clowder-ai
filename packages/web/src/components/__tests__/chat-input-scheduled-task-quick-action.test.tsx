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
  SKILL_OPTIONS_UPDATED_EVENT: 'skill-options-updated',
}));

const scheduledTaskAction = QUICK_ACTIONS.find((action) => action.icon === '/icons/time-time.svg');
const expertDebateAction = QUICK_ACTIONS.find((action) => action.icon === '/icons/expert-debate.svg');

if (!scheduledTaskAction) {
  throw new Error('Missing scheduled task quick action config');
}

if (!expertDebateAction || !expertDebateAction.expertCards?.length) {
  throw new Error('Missing expert debate quick action config');
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

  it('undoes expert card autofill back to the quick-action capsule state', async () => {
    await act(async () => {
      root.render(React.createElement(ChatInput, { threadId: 'thread-1', onSend: vi.fn() }));
    });
    await flush();

    const quickActionButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes(expertDebateAction.label),
    ) as HTMLButtonElement | undefined;
    expect(quickActionButton).toBeTruthy();

    act(() => {
      quickActionButton!.click();
    });
    await flush();

    const firstCard = expertDebateAction.expertCards[0]!;
    const expertCardButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes(firstCard.agentName),
    ) as HTMLButtonElement | undefined;
    expect(expertCardButton).toBeTruthy();

    act(() => {
      expertCardButton!.click();
    });
    await flush();

    const textbox = container.querySelector('[role="textbox"]') as HTMLDivElement | null;
    expect(textbox).toBeTruthy();
    expect(textbox!.textContent).toContain(expertDebateAction.label);
    expect(textbox!.textContent).toContain(firstCard.agentName);

    act(() => {
      textbox!.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await flush();

    expect(textbox!.textContent).toContain(expertDebateAction.label);
    expect(textbox!.textContent).not.toContain(firstCard.agentName);
  });
});
