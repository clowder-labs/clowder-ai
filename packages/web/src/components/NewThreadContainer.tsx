'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useSendMessage, type WhisperOptions } from '@/hooks/useSendMessage';
import type { DeliveryMode } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import { AgentsPanelCopy } from './AgentsPanelCopy';
import { ChannelsPanel } from './ChannelsPanel';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatInput } from './ChatInput';
import { DirectoryBrowserModal } from './DirectoryBrowserModal';
import { ModelsPanel } from './ModelsPanel';
import { SkillsPanel } from './SkillsPanel';
import { ThreadSidebar } from './ThreadSidebar';
import { ResizeHandle } from './workspace/ResizeHandle';

const HOME_DRAFT_THREAD_ID = '__new__';
const SIDEBAR_DEFAULT = 240;

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
  const setPendingNewThreadSend = useChatStore((s) => s.setPendingNewThreadSend);
  const attachPendingNewThreadTarget = useChatStore((s) => s.attachPendingNewThreadTarget);
  const clearPendingNewThreadSend = useChatStore((s) => s.clearPendingNewThreadSend);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMenu, setSidebarMenu] = useState<'chat' | 'models' | 'agents' | 'channels' | 'skills'>('chat');
  const [isFolderBrowserOpen, setIsFolderBrowserOpen] = useState(false);
  const [cwdPath, setCwdPath] = useState<string | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null);
  const [selectedFolderTitle, setSelectedFolderTitle] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth, resetSidebarWidth] = usePersistedState(
    'cat-cafe:sidebarWidth',
    SIDEBAR_DEFAULT,
  );

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
      }
    } catch {
      // Best-effort only. Fall back to the previous initial path.
    } finally {
      setIsFolderBrowserOpen(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 768px)').matches) {
      setSidebarOpen(true);
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
      attachPendingNewThreadTarget,
      clearPendingNewThreadSend,
      isCreatingThread,
      router,
      selectedFolderPath,
      setPendingNewThreadSend,
    ],
  );

  return (
    <div className="ui-shell-surface flex h-screen h-dvh">
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-20 bg-black/30 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <div
            className="fixed inset-y-0 left-0 z-30 flex-shrink-0 md:static md:z-auto"
            style={{ width: sidebarWidth }}
          >
            <ThreadSidebar
              onClose={() => setSidebarOpen(false)}
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
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 relative overflow-hidden">
          {sidebarMenu !== 'chat' && (
            <div className="ui-shell-surface h-full overflow-hidden px-8 pt-12 pb-5">
              {sidebarMenu === 'models' && <ModelsPanel />}
              {sidebarMenu === 'agents' && <AgentsPanelCopy />}
              {sidebarMenu === 'channels' && <ChannelsPanel />}
              {sidebarMenu === 'skills' && <SkillsPanel />}
            </div>
          )}
          {sidebarMenu === 'chat' && (
            <main className="ui-shell-surface flex-1 overflow-y-auto p-4" data-testid="new-thread-main">
              <ChatEmptyState
                bootcampCount={0}
                isCurrentBootcampThread={false}
                onOpenBootcampList={() => {}}
                onAgentsClick={() => setSidebarMenu('agents')}
                onChannelsClick={() => setSidebarMenu('channels')}
              />
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

      <DirectoryBrowserModal
        open={isFolderBrowserOpen}
        title="选择文件夹"
        initialPath={cwdPath ?? selectedFolderPath ?? undefined}
        activeProjectPath={cwdPath ?? undefined}
        onSelect={handleFolderSelect}
        onClose={() => setIsFolderBrowserOpen(false)}
      />
    </div>
  );
}
