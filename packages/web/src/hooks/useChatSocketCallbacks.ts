/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useMemo } from 'react';
import type { SocketCallbacks } from '@/hooks/useSocket';
import { type ChatMessage as ChatMessageData, useChatStore } from '@/stores/chatStore';
import { type TaskItem, useTaskStore } from '@/stores/taskStore';

interface ExternalDeps {
  threadId: string;
  userId: string;
  handleAgentMessage: SocketCallbacks['onMessage'];
  resetTimeout: () => void;
  clearDoneTimeout: (threadId?: string) => void;
  handleAuthRequest: NonNullable<SocketCallbacks['onAuthorizationRequest']>;
  handleAuthResponse: NonNullable<SocketCallbacks['onAuthorizationResponse']>;
  onNavigateToThread?: (threadId: string) => void;
}

/**
 * Socket event callbacks for a chat thread.
 * Extracted from ChatContainer to reduce file size.
 */
export function useChatSocketCallbacks({
  threadId,
  userId,
  handleAgentMessage,
  resetTimeout,
  clearDoneTimeout,
  handleAuthRequest,
  handleAuthResponse,
  onNavigateToThread,
}: ExternalDeps): SocketCallbacks {
  const {
    updateThreadTitle,
    setLoading,
    setHasActiveInvocation,
    setIntentMode,
    setTargetCats,
    addMessage,
    removeMessage,
  } = useChatStore();
  const { addTask, updateTask } = useTaskStore();

  return useMemo<SocketCallbacks>(
    () => ({
      clearDoneTimeout,
      onMessage: (msg) => {
        handleAgentMessage(msg);
        return true;
      },
      onThreadCreated: (data) => {
        // Refresh thread list for sidebar
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('office-claw:threads-refresh'));
        }
        // Navigate to new thread when created via connector command (e.g. /new in Feishu/Telegram)
        // This matches the behavior of onGameThreadCreated
        if (data.source === 'connector_command' && data.threadId) {
          onNavigateToThread?.(data.threadId);
        }
      },
      onThreadUpdated: (data) => updateThreadTitle(data.threadId, data.title),
      onIntentMode: (data) => {
        // Socket layer (useSocket) already applies dual-pointer guard + background routing.
        // This callback only fires for the truly active thread.
        setLoading(true);
        setHasActiveInvocation(true);
        setIntentMode(data.mode as 'ideate' | 'execute');
        setTargetCats((data as { targetCats?: string[] }).targetCats ?? []);
      },
      onTaskCreated: (task) => addTask(task as unknown as TaskItem),
      onTaskUpdated: (task) => updateTask(task as unknown as TaskItem),
      onThreadSummary: (summary) => {
        const s = summary as {
          id: string;
          threadId: string;
          topic: string;
          conclusions: string[];
          openQuestions: string[];
          createdBy: string;
          createdAt: number;
        };
        addMessage({
          id: `summary-${s.id}`,
          type: 'summary',
          content: s.topic,
          timestamp: s.createdAt,
          summary: {
            id: s.id,
            topic: s.topic,
            conclusions: s.conclusions,
            openQuestions: s.openQuestions,
            createdBy: s.createdBy,
          },
        } as ChatMessageData);
      },
      onHeartbeat: (data) => {
        if (data.threadId === threadId) resetTimeout();
      },
      onMessageDeleted: (data: { messageId: string }) => removeMessage(data.messageId),
      onMessageRestored: () => {
        /* re-fetching history if needed */
      },
      onThreadBranched: () => {
        /* branch navigation handled by the action initiator */
      },
      onAuthorizationRequest: handleAuthRequest,
      onAuthorizationResponse: handleAuthResponse,
    }),
    [
      handleAgentMessage,
      updateThreadTitle,
      setLoading,
      setHasActiveInvocation,
      setIntentMode,
      setTargetCats,
      addTask,
      updateTask,
      addMessage,
      removeMessage,
      resetTimeout,
      clearDoneTimeout,
      handleAuthRequest,
      handleAuthResponse,
      onNavigateToThread,
      threadId,
      userId,
    ],
  );
}
