import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentMessages } from '@/hooks/useAgentMessages';

const mockAddMessage = vi.fn((msg: Record<string, unknown>) => {
  storeState.messages.push(msg as never);
});
const mockAppendToMessage = vi.fn((id: string, content: string) => {
  storeState.messages = storeState.messages.map((m) => (m.id === id ? { ...m, content: m.content + content } : m));
});
const mockAppendToolEvent = vi.fn();
const mockAppendRichBlock = vi.fn();
const mockReplaceMessageId = vi.fn();
const mockPatchMessage = vi.fn();
const mockRemoveMessage = vi.fn();
const mockSetStreaming = vi.fn((id: string, streaming: boolean) => {
  storeState.messages = storeState.messages.map((m) => (m.id === id ? { ...m, isStreaming: streaming } : m));
});
const mockSetLoading = vi.fn();
const mockSetHasActiveInvocation = vi.fn();
const mockRemoveActiveInvocation = vi.fn();
const mockClearAllActiveInvocations = vi.fn();
const mockSetIntentMode = vi.fn();
const mockSetCatStatus = vi.fn();
const mockClearCatStatuses = vi.fn();
const mockSetCatInvocation = vi.fn((catId: string, info: Record<string, unknown>) => {
  storeState.catInvocations = {
    ...storeState.catInvocations,
    [catId]: { ...storeState.catInvocations[catId], ...info },
  };
});
const mockSetMessageUsage = vi.fn();
const mockSetMessageMetadata = vi.fn();
const mockSetMessageThinking = vi.fn();
const mockSetMessageStreamInvocation = vi.fn();
const mockRequestStreamCatchUp = vi.fn();

const mockAddMessageToThread = vi.fn();
const mockClearThreadActiveInvocation = vi.fn();
const mockResetThreadInvocationState = vi.fn();
const mockSetThreadMessageStreaming = vi.fn();
const mockGetThreadState = vi.fn(() => ({ messages: [] }));

const storeState = {
  messages: [] as Array<{
    id: string;
    type: string;
    catId?: string;
    content: string;
    isStreaming?: boolean;
    origin?: 'stream' | 'callback';
    extra?: { stream?: { invocationId?: string } };
    timestamp: number;
  }>,
  catInvocations: {} as Record<string, { invocationId?: string; taskProgress?: { tasks: unknown[] } }>,
  activeInvocations: {} as Record<string, { catId: string; mode: string }>,
  addMessage: mockAddMessage,
  appendToMessage: mockAppendToMessage,
  appendToolEvent: mockAppendToolEvent,
  appendRichBlock: mockAppendRichBlock,
  replaceMessageId: mockReplaceMessageId,
  patchMessage: mockPatchMessage,
  removeMessage: mockRemoveMessage,
  setStreaming: mockSetStreaming,
  setLoading: mockSetLoading,
  setHasActiveInvocation: mockSetHasActiveInvocation,
  removeActiveInvocation: mockRemoveActiveInvocation,
  clearAllActiveInvocations: mockClearAllActiveInvocations,
  setIntentMode: mockSetIntentMode,
  setCatStatus: mockSetCatStatus,
  clearCatStatuses: mockClearCatStatuses,
  setCatInvocation: mockSetCatInvocation,
  setMessageUsage: mockSetMessageUsage,
  setMessageMetadata: mockSetMessageMetadata,
  setMessageThinking: mockSetMessageThinking,
  setMessageStreamInvocation: mockSetMessageStreamInvocation,
  requestStreamCatchUp: mockRequestStreamCatchUp,

  addMessageToThread: mockAddMessageToThread,
  clearThreadActiveInvocation: mockClearThreadActiveInvocation,
  resetThreadInvocationState: mockResetThreadInvocationState,
  setThreadMessageStreaming: mockSetThreadMessageStreaming,
  getThreadState: mockGetThreadState,
  currentThreadId: 'thread-1',
};

let captured: ReturnType<typeof useAgentMessages> | undefined;

vi.mock('@/stores/chatStore', () => {
  const useChatStoreMock = Object.assign(() => storeState, { getState: () => storeState });
  return {
    useChatStore: useChatStoreMock,
  };
});

function Harness() {
  captured = useAgentMessages();
  return null;
}

describe('useAgentMessages terminal error suppression', () => {
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
    captured = undefined;
    storeState.messages = [];
    storeState.catInvocations = {};
    storeState.activeInvocations = {};
    vi.clearAllMocks();
    mockGetThreadState.mockImplementation(() => ({ messages: [] }));
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('drops late tool/thinking/text fragments after a terminal error until a new invocation starts', () => {
    storeState.messages = [
      {
        id: 'msg-live-1',
        type: 'assistant',
        catId: 'opus',
        content: 'partial reply',
        isStreaming: true,
        origin: 'stream',
        extra: { stream: { invocationId: 'inv-1' } },
        timestamp: Date.now(),
      },
    ];
    storeState.catInvocations = { opus: { invocationId: 'inv-1' } };

    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'error',
        catId: 'opus',
        error: 'jiuwen WebSocket connection closed unexpectedly',
        isFinal: true,
      });
    });

    vi.clearAllMocks();

    act(() => {
      captured?.handleAgentMessage({
        type: 'tool_use',
        catId: 'opus',
        toolName: 'web_search',
        toolInput: { q: 'cats' },
      });
    });
    act(() => {
      captured?.handleAgentMessage({
        type: 'system_info',
        catId: 'opus',
        content: JSON.stringify({ type: 'thinking', text: 'late thinking' }),
      });
    });
    act(() => {
      captured?.handleAgentMessage({
        type: 'text',
        catId: 'opus',
        content: '[错误]jiuwen WebSocket connection closed unexpectedly',
      });
    });

    expect(mockAppendToolEvent).not.toHaveBeenCalled();
    expect(mockSetMessageThinking).not.toHaveBeenCalled();
    expect(mockAppendToMessage).not.toHaveBeenCalled();
    expect(mockAddMessage).not.toHaveBeenCalled();

    act(() => {
      captured?.handleAgentMessage({
        type: 'system_info',
        catId: 'opus',
        content: JSON.stringify({ type: 'invocation_created', invocationId: 'inv-2' }),
      });
    });
    act(() => {
      captured?.handleAgentMessage({
        type: 'text',
        catId: 'opus',
        content: 'fresh reply',
      });
    });

    expect(mockAddMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'assistant',
        catId: 'opus',
        origin: 'stream',
        extra: { stream: { invocationId: 'inv-2' } },
      }),
    );
  });

  it('does not request stream catch-up after a terminal error with no recoverable bubble', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'system_info',
        catId: 'jiuwenclaw',
        content: JSON.stringify({ type: 'invocation_created', invocationId: 'inv-1' }),
      });
    });
    act(() => {
      captured?.handleAgentMessage({
        type: 'error',
        catId: 'jiuwenclaw',
        error: 'jiuwen WebSocket connection closed unexpectedly',
        isFinal: true,
      });
    });

    mockRequestStreamCatchUp.mockClear();

    act(() => {
      captured?.handleAgentMessage({
        type: 'done',
        catId: 'jiuwenclaw',
        isFinal: true,
      });
    });

    expect(mockRequestStreamCatchUp).not.toHaveBeenCalled();
  });
});
