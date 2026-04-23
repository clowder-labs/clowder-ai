/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatContainer } from '@/components/ChatContainer';
import { clearAuthIdentity } from '@/utils/userId';

const mockReplace = vi.fn();
const mockApiFetch = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: Parameters<typeof mockApiFetch>) => mockApiFetch(...args),
}));

vi.mock('@/utils/userId', () => ({
  clearAuthIdentity: vi.fn(),
  getUserId: () => 'test-user',
  setIsSkipAuth: vi.fn(),
}));

const mockClearAuthIdentity = vi.mocked(clearAuthIdentity);

vi.mock('@/hooks/useAgentMessages', () => ({
  useAgentMessages: () => ({
    handleAgentMessage: vi.fn(),
    handleStop: vi.fn(),
    resetRefs: vi.fn(),
    resetTimeout: vi.fn(),
    clearDoneTimeout: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAuthorization', () => ({
  useAuthorization: () => ({ pending: [], respond: vi.fn(), handleAuthRequest: vi.fn(), handleAuthResponse: vi.fn() }),
}));
vi.mock('@/hooks/useCatData', () => ({
  useCatData: () => ({ cats: [], getCatById: vi.fn() }),
}));
vi.mock('@/hooks/useChatHistory', () => ({
  useChatHistory: () => ({
    handleScroll: vi.fn(),
    scrollContainerRef: { current: null },
    messagesEndRef: { current: null },
    isLoadingHistory: false,
    hasMore: false,
  }),
}));
vi.mock('@/hooks/useChatSocketCallbacks', () => ({
  useChatSocketCallbacks: () => ({}),
}));
vi.mock('@/hooks/useGameApi', () => ({
  abortGame: vi.fn(),
  godAction: vi.fn(),
  submitAction: vi.fn(),
}));
vi.mock('@/hooks/useGameReconnect', () => ({
  reconnectGame: vi.fn(),
}));
vi.mock('@/hooks/usePersistedState', () => ({
  usePersistedState: (_key: string, initialValue: number) => [initialValue, vi.fn(), vi.fn()],
}));
vi.mock('@/hooks/usePreviewAutoOpen', () => ({ usePreviewAutoOpen: vi.fn() }));
vi.mock('@/hooks/useSendMessage', () => ({
  useSendMessage: () => ({ handleSend: vi.fn(), uploadStatus: null, uploadError: null }),
}));
vi.mock('@/hooks/useSocket', () => ({
  useSocket: () => ({ cancelInvocation: vi.fn(), syncRooms: vi.fn() }),
}));
vi.mock('@/hooks/useSplitPaneKeys', () => ({ useSplitPaneKeys: vi.fn() }));
vi.mock('@/hooks/useVadInterrupt', () => ({ useVadInterrupt: vi.fn() }));
vi.mock('@/hooks/useVoiceAutoPlay', () => ({ useVoiceAutoPlay: vi.fn() }));
vi.mock('@/hooks/useVoiceStream', () => ({ useVoiceStream: vi.fn() }));
vi.mock('@/hooks/useWorkspaceNavigate', () => ({ useWorkspaceNavigate: vi.fn() }));

vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn(),
}));
vi.mock('@/stores/gameStore', () => ({
  useGameStore: vi.fn(),
}));
vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => ({ clearTasks: vi.fn() }),
}));

vi.mock('@/components/A2ACollapsible', () => ({ A2ACollapsible: () => null }));
vi.mock('@/components/AgentsPanel', () => ({ AgentsPanel: () => null }));
vi.mock('@/components/AuthorizationCard', () => ({ AuthorizationCard: () => null }));
vi.mock('@/components/CatCafeHub', () => ({ CatCafeHub: () => null }));
vi.mock('@/components/ChannelsPanel', () => ({ ChannelsPanel: () => null }));
vi.mock('@/components/ChatContainerHeader', () => ({ ChatContainerHeader: () => null }));
vi.mock('@/components/ChatEmptyState', () => ({ ChatEmptyState: () => null }));
vi.mock('@/components/ChatInput', () => ({ ChatInput: () => null }));
vi.mock('@/components/ChatMessage', () => ({ ChatMessage: () => null }));
vi.mock('@/components/game/GameOverlayConnector', () => ({ GameOverlayConnector: () => null }));
vi.mock('@/components/HubListModal', () => ({ HubListModal: () => null }));
vi.mock('@/components/MessageActions', () => ({
  MessageActions: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/MobileStatusSheet', () => ({ MobileStatusSheet: () => null }));
vi.mock('@/components/ModelsPanel', () => ({ ModelsPanel: () => null }));
vi.mock('@/components/NewThreadContainer', () => ({
  NewThreadContainer: () => <div data-testid="new-thread-container">new-thread</div>,
}));
vi.mock('@/components/ParallelStatusBar', () => ({ ParallelStatusBar: () => null }));
vi.mock('@/components/QueuePanel', () => ({ QueuePanel: () => null }));
vi.mock('@/components/RightContentHeader', () => ({ RightContentHeader: () => null }));
vi.mock('@/components/ScrollToBottomButton', () => ({ ScrollToBottomButton: () => null }));
vi.mock('@/components/ScheduledTasksPanel', () => ({ ScheduledTasksPanel: () => null }));
vi.mock('@/components/SkillsPanel', () => ({ SkillsPanel: () => null }));
vi.mock('@/components/SplitPaneView', () => ({ SplitPaneView: () => null }));
vi.mock('@/components/ThinkingIndicator', () => ({ ThinkingIndicator: () => null }));
vi.mock('@/components/ThreadExecutionBar', () => ({ ThreadExecutionBar: () => null }));
vi.mock('@/components/ThreadSidebar', () => ({ ThreadSidebar: () => null }));
vi.mock('@/components/workspace/ResizeHandle', () => ({ ResizeHandle: () => null }));

function jsonResponse(body: unknown) {
  return {
    json: async () => body,
  };
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ChatContainer auth gate', () => {
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
    window.history.replaceState({}, '', 'http://localhost/');
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockReplace.mockReset();
    mockApiFetch.mockReset();
    mockClearAuthIdentity.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('shows the auth loading panel instead of the home shell while login status is pending', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    act(() => {
      root.render(React.createElement(ChatContainer, { mode: 'new', requireLoginCheck: true }));
    });

    expect(container.querySelector('[data-testid="chat-container-loading-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="new-thread-container"]')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('keeps a visible transition state while redirecting unauthenticated users to login', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ islogin: false, isskip: false }));

    await act(async () => {
      root.render(React.createElement(ChatContainer, { mode: 'new', requireLoginCheck: true }));
      await flushEffects();
    });

    expect(mockClearAuthIdentity).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(container.querySelector('[data-testid="chat-container-loading-panel"]')).not.toBeNull();
    expect(container.textContent).toContain('正在跳转登录页...');
    expect(container.querySelector('[data-testid="new-thread-container"]')).toBeNull();
  });

  it('renders the target page after a successful login check', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ islogin: true, isskip: false }));

    await act(async () => {
      root.render(React.createElement(ChatContainer, { mode: 'new', requireLoginCheck: true }));
      await flushEffects();
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="chat-container-loading-panel"]')).toBeNull();
    expect(container.querySelector('[data-testid="new-thread-container"]')).not.toBeNull();
  });

  it('opens the chat page directly when login was just confirmed in the same tab', async () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    act(() => {
      root.render(React.createElement(ChatContainer, { mode: 'new', requireLoginCheck: true, skipInitialAuthGate: true }));
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="chat-container-loading-panel"]')).toBeNull();
    expect(container.querySelector('[data-testid="new-thread-container"]')).not.toBeNull();
  });

  it('honors authSuccess from the URL on direct reloads after login', async () => {
    window.history.replaceState({}, '', 'http://localhost/?authSuccess=1');
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      root.render(React.createElement(ChatContainer, { mode: 'new', requireLoginCheck: true }));
      await flushEffects();
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="chat-container-loading-panel"]')).toBeNull();
    expect(container.querySelector('[data-testid="new-thread-container"]')).not.toBeNull();
    expect(new URL(window.location.href).searchParams.has('authSuccess')).toBe(false);
  });
});
