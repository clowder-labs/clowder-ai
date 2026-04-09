import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentMessages } from '@/hooks/useAgentMessages';

const mockAddMessage = vi.fn();
const mockAppendToMessage = vi.fn();
const mockAppendToolEvent = vi.fn();
const mockAppendRichBlock = vi.fn();
const mockReplaceMessageId = vi.fn();
const mockPatchMessage = vi.fn();
const mockRemoveMessage = vi.fn();
const mockSetStreaming = vi.fn();
const mockSetLoading = vi.fn();
const mockSetHasActiveInvocation = vi.fn();
const mockRemoveActiveInvocation = vi.fn();
const mockClearAllActiveInvocations = vi.fn();
const mockSetIntentMode = vi.fn();
const mockSetCatStatus = vi.fn();
const mockClearCatStatuses = vi.fn();
const mockSetCatInvocation = vi.fn();
const mockSetMessageUsage = vi.fn();
const mockSetMessageMetadata = vi.fn();
const mockSetMessageThinking = vi.fn();
const mockSetMessageStreamInvocation = vi.fn();
const mockRequestStreamCatchUp = vi.fn();
const mockAddToast = vi.fn();

const storeState = {
  messages: [] as Array<{
    id: string;
    type: string;
    catId?: string;
    content: string;
    isStreaming?: boolean;
    timestamp: number;
  }>,
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
  currentThreadId: 'thread-1',
  activeInvocations: {},
  catInvocations: {},
  getThreadState: vi.fn(() => ({ messages: [], activeInvocations: {}, catInvocations: {} })),
};

vi.mock('@/stores/chatStore', () => {
  const useChatStoreMock = Object.assign(() => storeState, { getState: () => storeState });
  return {
    useChatStore: useChatStoreMock,
  };
});

vi.mock('@/stores/toastStore', () => ({
  useToastStore: {
    getState: () => ({
      addToast: mockAddToast,
    }),
  },
}));

let captured: ReturnType<typeof useAgentMessages> | undefined;

function Harness() {
  captured = useAgentMessages();
  return null;
}

describe('useAgentMessages sensitive-input toast', () => {
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
    mockAddMessage.mockClear();
    mockAddToast.mockClear();
    mockSetCatStatus.mockClear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('pushes a sensitive-input toast for active-thread error events', () => {
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      captured?.handleAgentMessage({
        type: 'error',
        catId: 'codex',
        errorCode: 'ModelArts.81011',
        error: 'Input text May contain sensitive information, please try again.',
        isFinal: true,
      });
    });

    expect(mockSetCatStatus).toHaveBeenCalledWith('codex', 'error');
    expect(mockAddToast).toHaveBeenCalledWith({
      type: 'error',
      title: '检测到敏感词',
      message: '当前对话触发了敏感词校验，请重新打开一个新会话后再试。',
      threadId: 'thread-1',
      duration: 8000,
    });
    expect(mockAddMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'assistant',
        catId: 'codex',
        content: expect.stringContaining('重新打开一个新会话'),
      }),
    );
  });
});
