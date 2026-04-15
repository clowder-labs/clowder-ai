/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAgentMessages } from '@/hooks/useAgentMessages';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useCatData } from '@/hooks/useCatData';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useChatSocketCallbacks } from '@/hooks/useChatSocketCallbacks';
import { usePersistedState } from '@/hooks/usePersistedState';
import { usePreviewAutoOpen } from '@/hooks/usePreviewAutoOpen';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useSocket } from '@/hooks/useSocket';
import { useSplitPaneKeys } from '@/hooks/useSplitPaneKeys';
import { useVadInterrupt } from '@/hooks/useVadInterrupt';
import { useVoiceAutoPlay } from '@/hooks/useVoiceAutoPlay';
import { useVoiceStream } from '@/hooks/useVoiceStream';
import { useWorkspaceNavigate } from '@/hooks/useWorkspaceNavigate';
import { getMentionRe, getMentionToCat } from '@/lib/mention-highlight';
import { QUICK_ACTIONS } from '@/config/quick-actions';
import { type ChatMessage as ChatMessageData, useChatStore } from '@/stores/chatStore';
import { useTaskStore } from '@/stores/taskStore';
import { apiFetch } from '@/utils/api-client';
import { computeScrollRecomputeSignal } from '@/utils/scrollRecomputeSignal';
import { clearAuthIdentity, getUserId, setCanCreateModel, setIsSkipAuth } from '@/utils/userId';
import { AgentsPanel } from './AgentsPanel';
import { BootcampListModal } from './BootcampListModal';
import { CatCafeHub } from './CatCafeHub';
import { ChannelsPanel } from './ChannelsPanel';
import { ChatContainerHeader } from './ChatContainerHeader';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';
import { HubListModal } from './HubListModal';
import { MessageActions } from './MessageActions';
import { MobileStatusSheet } from './MobileStatusSheet';
import { ModelsPanel } from './ModelsPanel';
import { NewThreadContainer } from './NewThreadContainer';
import { ParallelStatusBar } from './ParallelStatusBar';
import { QueuePanel } from './QueuePanel';
import { RightContentHeader } from './RightContentHeader';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import { ScheduledTasksPanel } from './ScheduledTasksPanel';
import SecurityManagementModal from './SecurityManagementModal';
import { SkillsPanel } from './SkillsPanel';
import { SplitPaneView } from './SplitPaneView';
import { ThinkingIndicator } from './ThinkingIndicator';
import { ThreadExecutionBar } from './ThreadExecutionBar';
import { ThreadSidebar } from './ThreadSidebar';
import { LoadingPointStyle } from './LoadingPointStyle';
import { AuthHeroShowcase } from './auth/AuthShell';
import { ResizeHandle } from './workspace/ResizeHandle';

let cachedAuthChecked = false;
let cachedIsLoggedIn = false;
let cachedIsSkipAuth = false;

const SIDEBAR_DEFAULT = 240;
const MAIN_PANEL_MIN_WIDTH = 560; // 最小适配宽度800 - 左侧菜单宽度240
const MAIN_PANEL_MIN_NO_CHAT_WIDTH = 660;
const QUICK_ACTION_TOKEN_PREFIX = '[[quick_action:';
const QUICK_ACTION_TOKEN_SUFFIX = ']]';
const SCHEDULED_TASK_QUICK_ACTION_ICON = '/icons/scheduled-task.svg';

function buildScheduledTaskQuickActionInsertText(): string | null {
  const scheduledTaskAction = QUICK_ACTIONS.find((action) => action.icon === SCHEDULED_TASK_QUICK_ACTION_ICON);
  const label = scheduledTaskAction?.label?.trim();
  if (!label) return null;
  return `${QUICK_ACTION_TOKEN_PREFIX}${label}${QUICK_ACTION_TOKEN_SUFFIX} `;
}

function getFolderNameFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const normalized = path.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? normalized ?? null;
}

type ChatContainerProps =
  | {
      mode: 'new';
      requireLoginCheck?: boolean;
      skipInitialAuthGate?: boolean;
      threadId?: never;
      initialSidebarMenu?: never;
    }
  | {
      mode?: 'thread';
      threadId: string;
      requireLoginCheck?: boolean;
      skipInitialAuthGate?: boolean;
      initialSidebarMenu?: 'chat' | 'models' | 'agents' | 'channels' | 'skills' | 'scheduledTasks';
    };

function hasAuthSuccessFlagInLocation(): boolean {
  if (typeof window === 'undefined') return false;
  return new URL(window.location.href).searchParams.get('authSuccess') === '1';
}

function AuthLoadingPanel({ message = '加载中...' }: { message?: string }) {
  return (
    <div
      data-testid="chat-container-loading-panel"
      className="min-h-screen w-full bg-[radial-gradient(circle_at_top_left,_rgba(250,222,197,0.28),_transparent_38%),linear-gradient(135deg,_#FFF8F2_0%,_#FFFFFF_56%,_#FFF4EA_100%)] px-4 py-8 sm:px-6 md:px-8 lg:px-12 lg:py-10 xl:px-16"
    >
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1280px] items-center justify-center lg:min-h-[calc(100vh-5rem)]">
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
          <AuthHeroShowcase layout="standalone" />

          <div className="mt-12 flex items-center gap-3 text-[16px] font-normal text-[#595959] sm:text-base">
            <LoadingPointStyle className="h-5 w-5 flex-shrink-0" />
            <span>{message}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getMessageToolActivityTimestamp(message: ChatMessageData): number | null {
  if (!message.toolEvents || message.toolEvents.length === 0) return null;
  return Math.max(
    message.timestamp,
    ...message.toolEvents.map((event) => event.timestamp ?? message.timestamp),
  );
}

function mapPendingAuthorizationToMessages(
  messages: ChatMessageData[],
  pending: import('@/hooks/useAuthorization').AuthPendingRequest[],
): Map<string, import('@/hooks/useAuthorization').AuthPendingRequest[]> {
  const pendingByMessageId = new Map<string, import('@/hooks/useAuthorization').AuthPendingRequest[]>();
  const hostMessages = messages.filter(
    (message) =>
      message.type === 'assistant' &&
      Boolean(message.catId) &&
      Array.isArray(message.toolEvents) &&
      message.toolEvents.length > 0,
  );

  for (const request of pending) {
    const bestHost = hostMessages
      .filter((message) => message.catId === request.catId)
      .sort((left, right) => {
        if (left.isStreaming !== right.isStreaming) {
          return left.isStreaming ? -1 : 1;
        }

        const leftDelta = Math.abs((getMessageToolActivityTimestamp(left) ?? left.timestamp) - request.createdAt);
        const rightDelta = Math.abs((getMessageToolActivityTimestamp(right) ?? right.timestamp) - request.createdAt);
        if (leftDelta !== rightDelta) return leftDelta - rightDelta;

        return right.timestamp - left.timestamp;
      })[0];

    if (!bestHost) continue;

    const existing = pendingByMessageId.get(bestHost.id) ?? [];
    existing.push(request);
    pendingByMessageId.set(bestHost.id, existing);
  }

  return pendingByMessageId;
}

export function ChatContainer(props: ChatContainerProps) {
  const [skipInitialAuthGate] = useState(() => Boolean(props.skipInitialAuthGate) || hasAuthSuccessFlagInLocation());
  const [authChecked, setAuthChecked] = useState(() => {
    if (!props.requireLoginCheck || skipInitialAuthGate) return true;
    console.log('ChatContainer: initializing authChecked from cache:', cachedAuthChecked, 'cachedIsLoggedIn:', cachedIsLoggedIn);
    return cachedAuthChecked;
  });
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    if (!props.requireLoginCheck || skipInitialAuthGate) return true;
    console.log('ChatContainer: initializing isLoggedIn from cache:', cachedIsLoggedIn);
    return cachedIsLoggedIn;
  });
  const hasAuthRedirectedRef = useRef(false);
  const router = useRouter();
  const authPending = Boolean(props.requireLoginCheck) && !authChecked;
  const authRedirecting = Boolean(props.requireLoginCheck) && authChecked && !isLoggedIn;

  useEffect(() => {
    if (!skipInitialAuthGate || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('authSuccess')) return;
    url.searchParams.delete('authSuccess');
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl || '/');
  }, [skipInitialAuthGate]);

  useEffect(() => {
    if (!props.requireLoginCheck || skipInitialAuthGate) return;

    console.log('ChatContainer: checking cache - cachedAuthChecked:', cachedAuthChecked, 'cachedIsLoggedIn:', cachedIsLoggedIn);
    if (cachedAuthChecked && cachedIsLoggedIn) {
      console.log('ChatContainer: using cached auth state');
      setIsSkipAuth(cachedIsSkipAuth);
      setIsLoggedIn(true);
      setAuthChecked(true);
      return;
    }

    console.log('ChatContainer: cache not valid, making API call');
    let cancelled = false;

    const redirectTo = (target: string, external = false) => {
      if (hasAuthRedirectedRef.current) return;
      hasAuthRedirectedRef.current = true;
      if (external) {
        window.location.replace(target);
        return;
      }
      router.replace(target);
    };

    (async () => {
      let data: any = null;
      try {
        const response = await apiFetch('/api/islogin');
        data = await response.json();
        if (cancelled) return;
        setIsSkipAuth(Boolean(data?.isskip));
        setCanCreateModel(Boolean(data?.canCreateModel));
        if (data?.islogin) {
          console.log('ChatContainer: auth success, setting cache');
          setIsLoggedIn(true);
          cachedIsLoggedIn = true;
        } else {
          console.log('ChatContainer: auth failed, clearing cache');
          cachedIsLoggedIn = false;
          if (data?.pendingInvitation) {
            redirectTo('/login/invitation');
          } else {
            const loginUrl = typeof data?.loginUrl === 'string' ? data.loginUrl : '';
            if (loginUrl) {
              redirectTo(loginUrl, true);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('检查登录状态失败:', err);
        }
      } finally {
        if (!cancelled) {
          console.log('ChatContainer: auth check completed, setting cachedAuthChecked = true');
          setAuthChecked(true);
          cachedAuthChecked = true;
          cachedIsSkipAuth = Boolean(data?.isskip);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.requireLoginCheck, router, skipInitialAuthGate]);

  // Keep a full-screen transition state while auth is unresolved or redirecting
  // to login so the desktop shell never falls through to a blank page.
  if (authPending || authRedirecting) {
    return (
      <div className="ui-shell-surface flex h-screen h-dvh w-full overflow-hidden">
        <AuthLoadingPanel message={authRedirecting ? '正在跳转登录页...' : '加载中...'} />
      </div>
    );
  }

  if (props.mode === 'new') {
    return <NewThreadContainer />;
  }

  return (
    <ThreadModeChatContainer
      threadId={props.threadId}
      initialSidebarMenu={props.initialSidebarMenu}
      authChecked={authChecked}
    />
  );
}

function ThreadModeChatContainer({
  threadId,
  initialSidebarMenu = 'chat',
  authChecked,
}: {
  threadId: string;
  initialSidebarMenu?: 'chat' | 'models' | 'agents' | 'channels' | 'skills' | 'scheduledTasks';
  authChecked: boolean;
}) {
  const {
    messages,
    isLoading,
    hasActiveInvocation,
    intentMode,
    targetCats,
    catStatuses,
    catInvocations,
    setCurrentThread,
    viewMode,
    setViewMode,
    clearUnread,
    confirmUnreadAck,
    armUnreadSuppression,
    consumePendingNewThreadSend,
    setPendingChatInsert,
  } = useChatStore();
  const uiThinkingExpandedByDefault = useChatStore((s) => s.uiThinkingExpandedByDefault);
  const threads = useChatStore((s) => s.threads);


  // Export mode: ?export=true triggers print-friendly layout (no scroll containers)
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isExport = searchParams?.get('export') === 'true';
  // AC-6: research=multi hint from the Signal study button
  const isResearchMode = searchParams?.get('research') === 'multi';
  const { clearTasks } = useTaskStore();
  const { cats, getCatById } = useCatData();
  const firstAvailableCatId = useMemo(() => {
    const firstAvailable = cats.find((cat) => cat.roster?.available !== false);
    return firstAvailable?.id ?? cats[0]?.id ?? '';
  }, [cats]);
  const workspaceWorktreeId = useChatStore((s) => s.workspaceWorktreeId);
  usePreviewAutoOpen(workspaceWorktreeId);
  useWorkspaceNavigate(workspaceWorktreeId, threadId);
  const sidebarOpen = true;
  const [mobileStatusOpen, setMobileStatusOpen] = useState(false);
  const [showSecurityManagement, setShowSecurityManagement] = useState(false);
  const [showBootcampList, setShowBootcampList] = useState(false);
  const [showHubList, setShowHubList] = useState(false);
  const [stoppedIntentRecognition, setStoppedIntentRecognition] = useState<{
    timestamp: number;
    catId: string;
  } | null>(null);
  const [sidebarMenu, setSidebarMenu] = useState<
    'chat' | 'models' | 'agents' | 'channels' | 'skills' | 'scheduledTasks'
  >(
    initialSidebarMenu,
  );
  const scheduledTaskQuickActionInsertText = useMemo(() => buildScheduledTaskQuickActionInsertText(), []);
  const handleCreateScheduledTask = useCallback(() => {
    setSidebarMenu('chat');
    if (!scheduledTaskQuickActionInsertText) return;
    setPendingChatInsert({
      threadId,
      text: scheduledTaskQuickActionInsertText,
    });
  }, [scheduledTaskQuickActionInsertText, setPendingChatInsert, threadId]);
// F063: resizable split pane, chatBasis as percentage (20-80), persisted
  // F063 Gap 6: sidebar width in px, persisted
  const [sidebarWidth, setSidebarWidth, resetSidebarWidth] = usePersistedState(
    'cat-cafe:sidebarWidth',
    SIDEBAR_DEFAULT,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const handleSidebarResize = useCallback(
    (delta: number) => {
      setSidebarWidth((prev) => Math.min(480, Math.max(180, prev + delta)));
    },
    [setSidebarWidth],
  );

  const { handleAgentMessage, handleStop: stopHandler, resetRefs, resetTimeout, clearDoneTimeout } = useAgentMessages();
  const {
    handleScroll,
    scrollContainerRef,
    messagesEndRef,
    scrollToBottom,
    followLayoutChangeIfPinned,
    isLoadingHistory,
    hasMore,
  } =
    useChatHistory(threadId);
  const { handleSend, uploadStatus, uploadError } = useSendMessage(threadId, { resetRefs });
  const consumedPendingRequestIdsRef = useRef(new Set<string>());
  const {
    pending: authPending,
    respond: authRespond,
    handleAuthRequest,
    handleAuthResponse,
  } = useAuthorization(threadId);
  const seenAuthRequestIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const handler = (event: Event) => {
      const menu = (event as CustomEvent<{ menu?: 'skills' }>).detail?.menu;
      if (menu === 'skills') setSidebarMenu('skills');
    };
    window.addEventListener('cat-cafe:open-sidebar-menu', handler);
    return () => window.removeEventListener('cat-cafe:open-sidebar-menu', handler);
  }, []);

  // F096: Listen for interactive block send events
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail.text;
      if (text) {
        scrollToBottom('smooth');
        handleSend(text);
      }
    };
    window.addEventListener('cat-cafe:interactive-send', handler);
    return () => window.removeEventListener('cat-cafe:interactive-send', handler);
  }, [handleSend, scrollToBottom]);

  const { addMessage } = useChatStore();

  const messageSummary = useMemo(() => {
    const c = { total: messages.length, assistant: 0, system: 0, evidence: 0, followup: 0 };
    for (const msg of messages) {
      const isAssistant = msg.type === 'assistant' || (msg.type === 'user' && !!msg.catId);
      if (isAssistant) c.assistant++;
      if (msg.type === 'system') {
        c.system++;
        if (msg.variant === 'evidence') c.evidence++;
        if (msg.variant === 'a2a_followup') c.followup++;
      }
    }
    return c;
  }, [messages]);

  // Sync URL-driven threadId to store (store is follower, URL is source of truth)
  // setCurrentThread saves old thread state to map, restores new thread state.
  const setCurrentProject = useChatStore((s) => s.setCurrentProject);
  const storeThreads = useChatStore((s) => s.threads);
  const prevThreadRef = useRef(threadId);
  const currentThreadProjectPath = useMemo(
    () => storeThreads?.find((thread) => thread.id === threadId)?.projectPath ?? null,
    [storeThreads, threadId],
  );
  const currentThreadProjectName = useMemo(
    () => getFolderNameFromPath(currentThreadProjectPath),
    [currentThreadProjectPath],
  );
  useEffect(() => {
    if (prevThreadRef.current !== threadId) {
      // Thread switch: store saves/restores per-thread state automatically
      setCurrentThread(threadId);
      // Clean up non-thread-scoped refs
      resetRefs();
      clearTasks();
      prevThreadRef.current = threadId;
    }
    // First mount: sync threadId to store without save/restore
    setCurrentThread(threadId);
  }, [
    threadId,
    clearTasks, // Clean up non-thread-scoped refs
    resetRefs, // First mount: sync threadId to store without save/restore
    setCurrentThread,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // B1.1: Restore projectPath when thread or storeThreads change.
  // storeThreads is populated by ThreadSidebar.loadThreads shortly after mount,
  // so this covers both page refresh (threads arrive async) and thread switch.
  useEffect(() => {
    const cached = storeThreads?.find((t) => t.id === threadId);
    if (cached) {
      setCurrentProject(cached.projectPath || 'default');
    }
  }, [threadId, storeThreads, setCurrentProject]);

  const socketCallbacks = useChatSocketCallbacks({
    threadId,
    userId: getUserId(),
    handleAgentMessage,
    resetTimeout,
    clearDoneTimeout,
    handleAuthRequest,
    handleAuthResponse,
    onNavigateToThread: (tid) => router.push(`/thread/${tid}`),
  });


  const pendingAuthorizationByMessageId = useMemo(
    () => mapPendingAuthorizationToMessages(messages, authPending),
    [authPending, messages],
  );

  useEffect(() => {
    const seenRequestIds = seenAuthRequestIdsRef.current;
    const hasNewPendingRequest = authPending.some((request) => !seenRequestIds.has(request.requestId));
    seenAuthRequestIdsRef.current = new Set(authPending.map((request) => request.requestId));
    if (hasNewPendingRequest) {
      followLayoutChangeIfPinned('smooth');
    }
  }, [authPending, followLayoutChangeIfPinned]);

  const pendingIntentRecognitionTimestamp = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.type !== 'user' || lastMessage.catId) return null;
    if (!isLoading || !hasActiveInvocation) return null;
    if (intentMode === null) return lastMessage.timestamp;

    const hasAssistantResponseStarted = messages.some(
      (message) =>
        message.type === 'assistant' &&
        message.timestamp >= lastMessage.timestamp &&
        (
          message.isStreaming ||
          message.content.trim().length > 0 ||
          Boolean(message.thinking) ||
          Boolean(message.toolEvents?.length) ||
          Boolean(message.contentBlocks?.length) ||
          Boolean(message.extra?.rich?.blocks?.length)
        ),
    );

    if (!hasAssistantResponseStarted) return lastMessage.timestamp;
    return null;
  }, [hasActiveInvocation, intentMode, isLoading, messages]);

  const pendingIntentRecognitionCatId = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.type !== 'user' || lastMessage.catId) return firstAvailableCatId;

    const mentionMatches = Array.from(lastMessage.content.matchAll(getMentionRe()))
      .map((match) => getMentionToCat()[match[1]?.toLowerCase() ?? ''])
      .filter((catId): catId is string => Boolean(catId) && catId !== '__co-creator__');

    if (mentionMatches.length > 0) return mentionMatches[0];
    if (targetCats.length > 0) return targetCats[0];
    return firstAvailableCatId;
  }, [firstAvailableCatId, messages, targetCats]);

  // Bugfix: 将被停止的 intent recognition 持久化为真实 store 消息，
  // 使其稳定出现在新 user message 之前（正确的对话顺序）。
  // 必须在 handleSend（addMessage user msg）之前调用。
  const persistStoppedIntentRecognition = useCallback(() => {
    if (!stoppedIntentRecognition) return;
    addMessage({
      id: `intent-recognition-stopped-${stoppedIntentRecognition.timestamp}`,
      type: 'assistant',
      catId: stoppedIntentRecognition.catId,
      content: 'stopped',
      timestamp: stoppedIntentRecognition.timestamp + 1,
      variant: 'intent_recognition',
    } as ChatMessageData);
    setStoppedIntentRecognition(null);
  }, [stoppedIntentRecognition, addMessage]);

  useEffect(() => {
    if (!stoppedIntentRecognition) return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      setStoppedIntentRecognition(null);
      return;
    }

    if (
      pendingIntentRecognitionTimestamp != null &&
      pendingIntentRecognitionTimestamp !== stoppedIntentRecognition.timestamp
    ) {
      setStoppedIntentRecognition(null);
      return;
    }

    if (pendingIntentRecognitionTimestamp == null && lastMessage.timestamp !== stoppedIntentRecognition.timestamp) {
      setStoppedIntentRecognition(null);
    }
  }, [messages, pendingIntentRecognitionTimestamp, stoppedIntentRecognition]);

  const showThinkingIndicator =
    sidebarMenu === 'chat' &&
    intentMode === 'execute' &&
    pendingIntentRecognitionTimestamp == null;

  const renderSingleMessage = useCallback(
    (msg: ChatMessageData) => (
      <MessageActions key={msg.id} message={msg} threadId={threadId}>
        <ChatMessage
          message={msg}
          getCatById={getCatById}
          pendingAuthRequests={pendingAuthorizationByMessageId.get(msg.id)}
          onAuthRespond={authRespond}
          onOpenSecurityManagement={() => setShowSecurityManagement(true)}
        />
      </MessageActions>
    ),
    [threadId, getCatById, pendingAuthorizationByMessageId, authRespond],
  );

  useVoiceAutoPlay();
  useVoiceStream();
  useVadInterrupt();

  useSplitPaneKeys();
  const splitPaneThreadIds = useChatStore((s) => s.splitPaneThreadIds);
  const setSplitPaneThreadIds = useChatStore((s) => s.setSplitPaneThreadIds);
  const setSplitPaneTarget = useChatStore((s) => s.setSplitPaneTarget);

  const watchedThreadIds = useMemo(() => {
    const ids = new Set<string>(threads.map((thread) => thread.id));
    for (const splitThreadId of splitPaneThreadIds) {
      ids.add(splitThreadId);
    }
    return [...ids];
  }, [threads, splitPaneThreadIds]);

  const { cancelInvocation, awaitThreadRoom = async () => 'timed_out' as const } = useSocket(
    socketCallbacks,
    threadId,
    watchedThreadIds,
  );

  useEffect(() => {
    const pending = consumePendingNewThreadSend(threadId);
    if (!pending) return;
    if (consumedPendingRequestIdsRef.current.has(pending.requestId)) return;

    consumedPendingRequestIdsRef.current.add(pending.requestId);
    scrollToBottom('smooth');
    let cancelled = false;

    void (async () => {
      try {
        await awaitThreadRoom(threadId);
      } catch (error) {
        console.warn('[chat] awaitThreadRoom failed, continuing with best-effort send', {
          threadId,
          error,
        });
      }
      if (cancelled) return;
      handleSend(pending.content, pending.images, undefined, pending.whisper, pending.deliveryMode);
    })();

    return () => {
      cancelled = true;
    };
  }, [awaitThreadRoom, consumePendingNewThreadSend, handleSend, scrollToBottom, threadId]);

  useEffect(() => {
    if (viewMode === 'split' && splitPaneThreadIds.length === 0 && threadId !== 'default') {
      setSplitPaneThreadIds([threadId]);
      setSplitPaneTarget(threadId);
    }
  }, [viewMode, splitPaneThreadIds.length, threadId, setSplitPaneThreadIds, setSplitPaneTarget]);

  useEffect(() => {
    clearUnread(threadId);
  }, [threadId, clearUnread]);

  // F069-R5: Ack read cursor server-side. The backend finds the latest real message
  // and acks it atomically, with no frontend ID guessing and no timing races with fetchHistory.
  // Trigger on thread entry and on latest-message identity/state changes.
  // Using messages.length alone misses callback finalization that patches in-place
  // (same array length, but the latest message transitions stream -> callback/done).
  const readAckTriggerKey = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return `${threadId}:empty`;
    return [
      threadId,
      lastMessage.id,
      lastMessage.timestamp,
      lastMessage.origin ?? 'none',
      lastMessage.isStreaming ? 'streaming' : 'done',
      lastMessage.deliveredAt ?? 'none',
    ].join('|');
  }, [messages, threadId]);

  useEffect(() => {
    // Re-arm suppression before each ack. /read/latest is idempotent, so any
    // successful POST means server cursor is at latest, so any successful ack
    // can safely clear suppression (no generation tracking needed).
    armUnreadSuppression(threadId);
    apiFetch(`/api/threads/${encodeURIComponent(threadId)}/read/latest`, {
      method: 'POST',
    })
      .then((res) => {
        if (res.ok) {
          confirmUnreadAck(threadId);
        }
      })
      .catch((err) => {
        console.debug('[F069] read ack failed:', err);
      });
  }, [threadId, readAckTriggerKey, confirmUnreadAck, armUnreadSuppression]);

  const handleStop = useCallback(
    (overrideThreadId?: unknown) => {
      const targetThreadId = typeof overrideThreadId === 'string' ? overrideThreadId : threadId;
      if (targetThreadId === threadId && pendingIntentRecognitionTimestamp != null) {
        setStoppedIntentRecognition({
          timestamp: pendingIntentRecognitionTimestamp,
          catId: pendingIntentRecognitionCatId,
        });
      }
      stopHandler(cancelInvocation, targetThreadId);
    },
    [stopHandler, cancelInvocation, pendingIntentRecognitionCatId, pendingIntentRecognitionTimestamp, threadId],
  );

  const router = useRouter();

  const handleZoomToThread = useCallback(
    (tid: string) => {
      setViewMode('single');
      router.push(`/thread/${tid}`);
    },
    [setViewMode, router],
  );

  if (viewMode === 'split') {
    return (
      <>
        <SplitPaneView
          onSend={handleSend}
          onStop={handleStop}
          uploadStatus={uploadStatus}
          uploadError={uploadError}
          onZoomToThread={handleZoomToThread}
        />
        <CatCafeHub />
      </>
    );
  }

  // Export mode: print-friendly layout with no sidebars or scroll containers
  if (isExport) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto p-4">
          {messages.map((msg) => renderSingleMessage(msg))}
        </div>
      </div>
    );
  }
  return (
    <div ref={containerRef} className="ui-shell-surface flex h-screen h-dvh w-screen">
        <div className="z-30 h-full flex-shrink-0" style={{ width: sidebarWidth }}>
          <ThreadSidebar
            className="w-full"
            onBootcampClick={() => setShowBootcampList(true)}
            onHubClick={() => setShowHubList(true)}
            onThreadSelect={() => setSidebarMenu('chat')}
            onMenuClick={(menu) => setSidebarMenu(menu)}
            activeMenu={sidebarMenu === 'chat' ? undefined : sidebarMenu}
          />
        </div>
        <div className="hidden md:flex items-center">
          <ResizeHandle direction="horizontal" onResize={handleSidebarResize} onDoubleClick={resetSidebarWidth} />
        </div>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="flex h-full min-h-0 flex-col" style={{ minWidth: sidebarMenu === 'chat' ?  MAIN_PANEL_MIN_WIDTH : MAIN_PANEL_MIN_NO_CHAT_WIDTH }}>
        <RightContentHeader />
        {sidebarMenu === 'chat' && (
          <ChatContainerHeader
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => {}}
            threadId={threadId}
            authPendingCount={authPending.length}
            targetCats={targetCats}
            viewMode={viewMode}
            onToggleViewMode={() => setViewMode(viewMode === 'single' ? 'split' : 'single')}
            onOpenMobileStatus={() => setMobileStatusOpen(true)}
            defaultCatId={targetCats[0] || firstAvailableCatId}
          />
        )}

        {sidebarMenu === 'chat' && intentMode === 'ideate' && <ParallelStatusBar onStop={handleStop} />}
        {showThinkingIndicator && <ThinkingIndicator onCancel={cancelInvocation} />}

        <div className="relative flex-1 min-h-0">
          {sidebarMenu !== 'chat' && (
            <div
              className={`ui-shell-surface h-full px-12 py-8 ${
                sidebarMenu === 'models' || sidebarMenu === 'skills' ? 'overflow-y-auto' : 'overflow-hidden'
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
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="ui-shell-surface h-full min-h-0 overflow-y-auto p-6"
              data-chat-container
            >
              {authChecked ? (
                <>
                  {isLoadingHistory && <div className="text-center py-3 text-sm text-gray-400">加载历史消息...</div>}
                  {!hasMore && messages.length > 0 && (
                    <div className="text-center py-3 text-xs text-gray-300 hidden">没有更多消息...</div>
                  )}
                  {messages.length === 0 && !isLoadingHistory ? (
                    <ChatEmptyState
                      onAgentsClick={() => setSidebarMenu('agents')}
                      onChannelsClick={() => setSidebarMenu('channels')}
                    />
                  ) : (
                    messages.map((msg) => renderSingleMessage(msg))
                  )}
                  {pendingIntentRecognitionTimestamp != null &&
                    renderSingleMessage({
                      id: `intent-recognition-${pendingIntentRecognitionTimestamp}`,
                      type: 'assistant',
                      catId: pendingIntentRecognitionCatId,
                      content: '',
                      timestamp: pendingIntentRecognitionTimestamp,
                      variant: 'intent_recognition',
                    } as ChatMessageData)}
                  {pendingIntentRecognitionTimestamp == null &&
                    stoppedIntentRecognition != null &&
                    renderSingleMessage({
                      id: `intent-recognition-stopped-${stoppedIntentRecognition.timestamp}`,
                      type: 'assistant',
                      catId: stoppedIntentRecognition.catId,
                      content: 'stopped',
                      timestamp: stoppedIntentRecognition.timestamp,
                      variant: 'intent_recognition',
                    } as ChatMessageData)}
                  <div ref={messagesEndRef} />
                  {sidebarMenu === 'chat' && (
                    <ScrollToBottomButton
                      scrollContainerRef={scrollContainerRef}
                      messagesEndRef={messagesEndRef}
                      recomputeSignal={computeScrollRecomputeSignal(
                        threadId,
                        messages,
                        uiThinkingExpandedByDefault ? 1 : 0,
                      )}
                      observerKey={threadId}
                    />
                  )}
                </>
              ) : (
                <AuthLoadingPanel />
              )}
            </main>
          )}
        </div>
        {sidebarMenu === 'chat' && <ThreadExecutionBar />}
        {sidebarMenu === 'chat' && <QueuePanel threadId={threadId} />}
        {sidebarMenu === 'chat' && isResearchMode && (
          <div className="mx-4 mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            多智能体研究模式 - 文章上下文已注入。请输入研究问题，智能体会自动调用 multi_mention 邀请其他智能体参与分析。
          </div>
        )}
        {sidebarMenu === 'chat' && (
          <ChatInput
            key={threadId}
            threadId={threadId}
            onSend={(content, images, whisper, deliveryMode) => {
              // 先将被停止的 intent recognition bubble 持久化为真实消息，
              // 确保它出现在新 user message 之前（正确的对话顺序）
              persistStoppedIntentRecognition();
              scrollToBottom('smooth');
              handleSend(content, images, undefined, whisper, deliveryMode);
            }}
            onStop={handleStop}
            disabled={false}
            folderSelectionEnabled={false}
            selectedFolderName={currentThreadProjectName}
            selectedFolderTitle={currentThreadProjectPath}
            hasActiveInvocation={hasActiveInvocation}
            uploadStatus={uploadStatus}
            uploadError={uploadError}
          />
        )}

        </div>
      </div>

      <MobileStatusSheet
        open={mobileStatusOpen}
        onClose={() => setMobileStatusOpen(false)}
        intentMode={intentMode}
        targetCats={targetCats}
        catStatuses={catStatuses}
        catInvocations={catInvocations}
        threadId={threadId}
        messageSummary={messageSummary}
      />
      <CatCafeHub />
      <HubListModal open={showHubList} onClose={() => setShowHubList(false)} currentThreadId={threadId} />
      <BootcampListModal
        open={showBootcampList}
        onClose={() => setShowBootcampList(false)}
        currentThreadId={threadId}
      />
      <SecurityManagementModal open={showSecurityManagement} onClose={() => setShowSecurityManagement(false)} />
    </div>
  );
}
