/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { QUICK_ACTIONS } from '@/config/quick-actions';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useSendMessage, type WhisperOptions } from '@/hooks/useSendMessage';
import { useSocket } from '@/hooks/useSocket';
import type { DeliveryMode } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { AgentsPanel } from './AgentsPanel';
import { ChannelsPanel } from './ChannelsPanel';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatInput } from './ChatInput';
import { DirectoryBrowserModal } from './DirectoryBrowserModal';
import { ModelsPanel } from './ModelsPanel';
import { RightContentHeader } from './RightContentHeader';
import { ScheduledTasksPanel } from './ScheduledTasksPanel';
import { SkillsPanel } from './SkillsPanel';
import { ThreadSidebar } from './ThreadSidebar';
import { ResizeHandle } from './workspace/ResizeHandle';

const HOME_DRAFT_THREAD_ID = '__new__';
const SIDEBAR_DEFAULT = 240;
const MAIN_PANEL_MIN_WIDTH = 560; // 最小适配宽度800 - 左侧菜单宽度240
const MAIN_PANEL_MIN_NO_CHAT_WIDTH = 660;
const QUICK_ACTION_TOKEN_PREFIX = '[[quick_action:';
const QUICK_ACTION_TOKEN_SUFFIX = ']]';
const SCHEDULED_TASK_QUICK_ACTION_ICON = '/icons/scheduled-task.svg';
const MAX_SESSIONS = 200;

function buildScheduledTaskQuickActionInsertText(): string | null {
  const scheduledTaskAction = QUICK_ACTIONS.find((action) => action.icon === SCHEDULED_TASK_QUICK_ACTION_ICON);
  const label = scheduledTaskAction?.label?.trim();
  if (!label) return null;
  return `${QUICK_ACTION_TOKEN_PREFIX}${label}${QUICK_ACTION_TOKEN_SUFFIX} `;
}

function getFolderNameFromPath(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

function getCreateThreadErrorMessage(status: number, detail?: unknown): string {
  if (typeof detail === 'string' && detail.trim()) return detail;
  return `Failed to create thread (HTTP ${status})`;
}

export function NewThreadContainer() {
  const router = useRouter();
  const setCurrentThread = useChatStore((s) => s.setCurrentThread);
  const threads = useChatStore((s) => s.threads);
  const setPendingNewThreadSend = useChatStore((s) => s.setPendingNewThreadSend);
  const attachPendingNewThreadTarget = useChatStore((s) => s.attachPendingNewThreadTarget);
  const clearPendingNewThreadSend = useChatStore((s) => s.clearPendingNewThreadSend);
  const setPendingChatInsert = useChatStore((s) => s.setPendingChatInsert);
  const { addToast } = useToastStore();
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarMenu, setSidebarMenu] = useState<
    'chat' | 'models' | 'agents' | 'channels' | 'skills' | 'scheduledTasks'
  >('chat');
  const [isFolderBrowserOpen, setIsFolderBrowserOpen] = useState(false);
  const [cwdPath, setCwdPath] = useState<string | null>(null);
  const [defaultWorkspacePath, setDefaultWorkspacePath] = useState<string | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null);
  const [selectedFolderTitle, setSelectedFolderTitle] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth, resetSidebarWidth] = usePersistedState(
    'cat-cafe:sidebarWidth',
    SIDEBAR_DEFAULT,
  );
  const scheduledTaskQuickActionInsertText = useMemo(() => buildScheduledTaskQuickActionInsertText(), []);
  const handleCreateScheduledTask = useCallback(() => {
    setSidebarMenu('chat');
    if (!scheduledTaskQuickActionInsertText) return;
    setPendingChatInsert({
      threadId: HOME_DRAFT_THREAD_ID,
      text: scheduledTaskQuickActionInsertText,
    });
  }, [scheduledTaskQuickActionInsertText, setPendingChatInsert]);
  const socketCallbacks = useMemo(
    () => ({
      onMessage: () => {},
      onThreadCreated: () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cat-cafe:threads-refresh'));
        }
      },
    }),
    [],
  );
  const watchedThreadIds = useMemo(() => threads.map((thread) => thread.id), [threads]);
  useSocket(socketCallbacks, undefined, watchedThreadIds);

  const handleFolderSelect = useCallback((path: string) => {
    setSelectedFolderPath(path);
    setSelectedFolderName(getFolderNameFromPath(path));
    setSelectedFolderTitle(path);
    setIsFolderBrowserOpen(false);
  }, []);

  const handleOpenFolderPicker = useCallback(async () => {
    try {
      const res = await apiFetch('/api/projects/cwd');
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.path === 'string' && data.path.trim()) {
          setCwdPath(data.path);
        }
        if (typeof data?.workspacePath === 'string' && data.workspacePath.trim()) {
          setDefaultWorkspacePath(data.workspacePath);
        } else {
          setDefaultWorkspacePath(null);
        }
      }
    } catch {
      // Best-effort only. Fall back to the previous initial path.
    } finally {
      setIsFolderBrowserOpen(true);
    }
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const menu = (event as CustomEvent<{ menu?: 'skills' }>).detail?.menu;
      if (menu === 'skills') setSidebarMenu('skills');
    };
    window.addEventListener('cat-cafe:open-sidebar-menu', handler);
    return () => window.removeEventListener('cat-cafe:open-sidebar-menu', handler);
  }, []);

  const handleSidebarResize = useCallback(
    (delta: number) => {
      setSidebarWidth((prev) => Math.min(480, Math.max(180, prev + delta)));
    },
    [setSidebarWidth],
  );

  const handleSend = useCallback(
    async (content: string, images?: File[], whisper?: WhisperOptions, deliveryMode?: DeliveryMode) => {
      if (isCreatingThread) return;

      const actualThreadCount = threads.filter((t) => t.id !== 'default').length;
      if (actualThreadCount >= MAX_SESSIONS) {
        addToast({
          type: 'error',
          title: '会话数量已达上限',
          message: `当前会话数量已达到 ${MAX_SESSIONS} 个上限，请删除一些会话后再创建新会话。`,
          duration: 5000,
        });
        return;
      }

      setIsCreatingThread(true);
      setError(null);
      setPendingNewThreadSend({
        requestId: globalThis.crypto?.randomUUID?.() ?? `pending-${Date.now()}`,
        content,
        images,
        whisper,
        deliveryMode,
        createdAt: Date.now(),
      });

      try {
        const createThreadPayload = selectedFolderPath ? { projectPath: selectedFolderPath } : {};
        const response = await apiFetch('/api/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createThreadPayload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(getCreateThreadErrorMessage(response.status, data?.detail));
        }

        const thread = await response.json();
        if (!thread?.id) {
          throw new Error('Failed to create thread');
        }

        attachPendingNewThreadTarget(thread.id);
        router.push(`/thread/${thread.id}`);
      } catch (err) {
        clearPendingNewThreadSend();
        setError(err instanceof Error ? err.message : 'Failed to create thread');
      } finally {
        setIsCreatingThread(false);
      }
    },
    [
      addToast,
      attachPendingNewThreadTarget,
      clearPendingNewThreadSend,
      isCreatingThread,
      router,
      selectedFolderPath,
      setPendingNewThreadSend,
      threads,
    ],
  );

  return (
    <div className="ui-shell-surface flex h-screen h-dvh w-screen">
      <div className="z-30 h-full flex-shrink-0" style={{ width: sidebarWidth }}>
        <ThreadSidebar
          className="w-full"
          onMenuClick={(menu) => setSidebarMenu(menu)}
          onNewChatClick={() => {
            setSidebarMenu('chat');
            setCurrentThread('default');
          }}
          activeMenu={sidebarMenu === 'chat' ? undefined : sidebarMenu}
        />
      </div>
      <div className="hidden items-center md:flex">
        <ResizeHandle direction="horizontal" onResize={handleSidebarResize} onDoubleClick={resetSidebarWidth} />
      </div>

      <div className="min-w-0 flex-1 overflow-x-auto">
        <div
          className="flex h-full min-h-0 min-w-0 flex-col"
          style={{ minWidth: sidebarMenu === 'chat' ? MAIN_PANEL_MIN_WIDTH : MAIN_PANEL_MIN_NO_CHAT_WIDTH }}
        >
          <RightContentHeader />
          <div className="relative flex-1 min-h-0">
            {sidebarMenu !== 'chat' && (
              <div
                className={`ui-shell-surface h-full px-8 pt-6 pb-5 ${
                  sidebarMenu === 'models' || sidebarMenu === 'skills' ? 'overflow-y-auto' : ''
                }`}
              >
                {sidebarMenu === 'models' && <ModelsPanel />}
                {sidebarMenu === 'agents' && <AgentsPanel />}
                {sidebarMenu === 'channels' && <ChannelsPanel />}
                {sidebarMenu === 'skills' && <SkillsPanel />}
                {sidebarMenu === 'scheduledTasks' && <ScheduledTasksPanel onCreateTask={handleCreateScheduledTask} />}
              </div>
            )}
            {sidebarMenu === 'chat' && (
              <main
                className="ui-shell-surface flex h-full min-h-0 flex-col overflow-y-auto p-4"
                data-testid="new-thread-main"
              >
                <div className="flex flex-1 items-center justify-center">
                  <ChatEmptyState
                    onAgentsClick={() => setSidebarMenu('agents')}
                    onChannelsClick={() => setSidebarMenu('channels')}
                    fillAvailableHeight
                  />
                </div>
              </main>
            )}
          </div>

          {sidebarMenu === 'chat' && (
            <ChatInput
              threadId={HOME_DRAFT_THREAD_ID}
              onSend={handleSend}
              disabled={isCreatingThread}
              folderSelectionEnabled
              selectedFolderName={selectedFolderName}
              selectedFolderTitle={selectedFolderTitle}
              onOpenFolderPicker={() => {
                void handleOpenFolderPicker();
              }}
            />
          )}
        </div>
      </div>

      <DirectoryBrowserModal
        open={isFolderBrowserOpen}
        title="选择文件夹"
        initialPath={selectedFolderPath ?? defaultWorkspacePath ?? cwdPath ?? undefined}
        activeProjectPath={selectedFolderPath ?? defaultWorkspacePath ?? undefined}
        onSelect={handleFolderSelect}
        onClose={() => setIsFolderBrowserOpen(false)}
      />
    </div>
  );
}
