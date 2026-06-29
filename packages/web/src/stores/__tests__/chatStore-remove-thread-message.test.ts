import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../chat-types';

// F070 stale-banner fix (砚砚 R2 P1) — verify removeThreadMessage now mirrors to
// threadStates AND writes the deletion to the offline snapshot so the message
// doesn't reappear on the next IDB first-paint.

const saveThreadMessagesMock = vi.hoisted(() =>
  vi.fn(async (_threadId: string, _messages: ChatMessage[], _hasMore: boolean) => {}),
);

vi.mock('@/utils/offline-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/offline-store')>();
  return {
    ...actual,
    saveThreadMessages: (threadId: string, messages: ChatMessage[], hasMore: boolean) =>
      saveThreadMessagesMock(threadId, messages, hasMore),
  };
});

const { useChatStore } = await import('../chatStore');

function makeMsg(id: string, content = 'hello'): ChatMessage {
  return { id, type: 'user', content, timestamp: Date.now() };
}

function resetStore(currentThreadId: string, init: Record<string, unknown> = {}) {
  useChatStore.setState({
    messages: [],
    isLoading: false,
    isLoadingHistory: false,
    hasMore: true,
    hasActiveInvocation: false,
    hasDraft: false,
    intentMode: null,
    targetCats: [],
    catStatuses: {},
    catInvocations: {},
    currentGame: null,
    threadStates: {},
    viewMode: 'single',
    splitPaneThreadIds: [],
    splitPaneTargetId: null,
    currentThreadId,
    currentProjectPath: 'default',
    threads: [],
    isLoadingThreads: false,
    ...init,
  });
}

describe('chatStore.removeThreadMessage — F070 stale-banner fix', () => {
  beforeEach(() => {
    saveThreadMessagesMock.mockReset();
  });

  afterEach(() => {
    saveThreadMessagesMock.mockReset();
  });

  it('active thread: removes from flat messages AND mirrors to threadStates AND persists snapshot', async () => {
    const banner = makeMsg('gov-blocked-1');
    const userMsg = makeMsg('user-1');
    resetStore('thread-active', {
      messages: [banner, userMsg],
      hasMore: false,
      threadStates: {
        'thread-active': {
          messages: [banner, userMsg],
          hasMore: false,
          isLoading: false,
          isLoadingHistory: false,
          hasActiveInvocation: false,
          hasDraft: false,
          intentMode: null,
          targetCats: [],
          catStatuses: {},
          catInvocations: {},
          activeInvocations: {},
          queue: [],
          executionDigest: null,
        } as never,
      },
    });

    useChatStore.getState().removeThreadMessage('thread-active', 'gov-blocked-1');

    // (a) flat messages: banner gone
    const flat = useChatStore.getState().messages;
    expect(flat.map((m) => m.id)).toEqual(['user-1']);

    // (b) threadStates mirror: banner also gone in threadStates view
    const mirrored = useChatStore.getState().threadStates['thread-active'];
    expect(mirrored?.messages.map((m) => m.id)).toEqual(['user-1']);

    // (c) offline snapshot persisted — args: (threadId, nextMessages, hasMore)
    // microtask-scheduled inside the action; flush.
    await Promise.resolve();
    await Promise.resolve();
    expect(saveThreadMessagesMock).toHaveBeenCalledTimes(1);
    const call = saveThreadMessagesMock.mock.calls[0];
    expect(call).toBeDefined();
    const [tid, msgs, hasMore] = call as unknown as [string, ChatMessage[], boolean];
    expect(tid).toBe('thread-active');
    expect(msgs.map((m) => m.id)).toEqual(['user-1']);
    expect(hasMore).toBe(false);
  });

  it('background (non-active) thread: removes from threadStates AND persists snapshot', async () => {
    const stalebanner = makeMsg('gov-blocked-stale');
    const other = makeMsg('other-msg');
    resetStore('thread-active', {
      messages: [],
      threadStates: {
        'thread-background': {
          messages: [stalebanner, other],
          hasMore: true,
          isLoading: false,
          isLoadingHistory: false,
          hasActiveInvocation: false,
          hasDraft: false,
          intentMode: null,
          targetCats: [],
          catStatuses: {},
          catInvocations: {},
          activeInvocations: {},
          queue: [],
          executionDigest: null,
        } as never,
      },
    });

    useChatStore.getState().removeThreadMessage('thread-background', 'gov-blocked-stale');

    // flat untouched (background thread)
    expect(useChatStore.getState().messages).toEqual([]);

    // background threadStates: banner gone
    const bg = useChatStore.getState().threadStates['thread-background'];
    expect(bg?.messages.map((m) => m.id)).toEqual(['other-msg']);

    // offline snapshot persisted to the background thread key
    await Promise.resolve();
    await Promise.resolve();
    expect(saveThreadMessagesMock).toHaveBeenCalledTimes(1);
    const call = saveThreadMessagesMock.mock.calls[0];
    expect(call).toBeDefined();
    const [tid, msgs, hasMore] = call as unknown as [string, ChatMessage[], boolean];
    expect(tid).toBe('thread-background');
    expect(msgs.map((m) => m.id)).toEqual(['other-msg']);
    expect(hasMore).toBe(true);
  });

  it('no-op when message id is absent: does NOT touch snapshot', async () => {
    const existing = makeMsg('keep-me');
    resetStore('thread-active', {
      messages: [existing],
      hasMore: false,
    });

    useChatStore.getState().removeThreadMessage('thread-active', 'does-not-exist');

    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['keep-me']);
    await Promise.resolve();
    await Promise.resolve();
    expect(saveThreadMessagesMock).not.toHaveBeenCalled();
  });

  it('no-op when target thread has no threadStates entry: does NOT touch snapshot', async () => {
    resetStore('thread-active', { messages: [] });

    useChatStore.getState().removeThreadMessage('thread-unknown', 'any-id');

    await Promise.resolve();
    await Promise.resolve();
    expect(saveThreadMessagesMock).not.toHaveBeenCalled();
  });
});
