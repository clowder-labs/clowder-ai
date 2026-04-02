import { useCallback, useEffect, useRef, useState } from 'react';
import { useCatData } from '@/hooks/useCatData';
import type { ThreadState } from '@/stores/chat-types';
import { API_URL } from '@/utils/api-client';
import { CatAvatar } from '../CatAvatar';
import { PawIcon } from '../icons/PawIcon';
import { formatRelativeTime } from './thread-utils';

export interface ThreadItemProps {
  id: string;
  title: string | null;
  participants: string[];
  lastActiveAt: number;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, title: string) => void | Promise<void>;
  onTogglePin?: (id: string, pinned: boolean) => void | Promise<void>;
  onToggleFavorite?: (id: string, favorited: boolean) => void | Promise<void>;
  onUpdatePreferredCats?: (id: string, cats: string[]) => void | Promise<void>;
  isPinned?: boolean;
  isFavorited?: boolean;
  threadState?: ThreadState;
  indented?: boolean;
  preferredCats?: string[];
  isHubThread?: boolean;
  sourceLabel?: string;
}

export function ThreadItem({
  id,
  title,
  participants,
  lastActiveAt,
  isActive,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
  onToggleFavorite,
  isPinned,
  isFavorited,
  threadState,
  indented,
  isHubThread,
  sourceLabel,
}: ThreadItemProps) {
  const { getCatById } = useCatData();
  const unreadCount = Math.max(0, threadState?.unreadCount ?? 0);
  const showUnreadBadge = unreadCount > 0;
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const canDelete = id !== 'default' && onDelete;
  const canRename = id !== 'default' && onRename;
  const canPin = id !== 'default' && onTogglePin;
  const canFavorite = id !== 'default' && onToggleFavorite;

  const [isSaving, setIsSaving] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title ?? '');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showRenameDialog) setDraftTitle(title ?? '');
  }, [title, showRenameDialog]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      const target = event.target as Node | null;
      if (target && !menuRef.current.contains(target)) {
        closeMenu();
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('blur', closeMenu);

    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('blur', closeMenu);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu || !menuRef.current) return;
    const viewportPadding = 8;
    const rect = menuRef.current.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - viewportPadding;
    const maxY = window.innerHeight - rect.height - viewportPadding;
    const nextX = Math.min(Math.max(contextMenu.x, viewportPadding), Math.max(viewportPadding, maxX));
    const nextY = Math.min(Math.max(contextMenu.y, viewportPadding), Math.max(viewportPadding, maxY));
    if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
      setContextMenu({ x: nextX, y: nextY });
    }
  }, [contextMenu]);

  const submitRename = useCallback(async () => {
    if (!onRename) return;
    const next = draftTitle.trim();
    if (!next) {
      setDraftTitle(title ?? '');
      setShowRenameDialog(false);
      return;
    }
    if (next === (title ?? '')) {
      setShowRenameDialog(false);
      return;
    }

    setIsSaving(true);
    try {
      await onRename(id, next);
      setShowRenameDialog(false);
    } finally {
      setIsSaving(false);
    }
  }, [onRename, draftTitle, title, id]);

  const displayTitle = title ?? (id === 'default' ? '大厅' : '未命名对话');
  const participantNames = participants.map((catId) => getCatById(catId)?.displayName ?? catId).join(', ');
  const description = participantNames || (isHubThread ? 'Hub 会话' : '暂无会话描述');

  const tooltipLines = [displayTitle];
  if (participantNames) tooltipLines.push(`参与: ${participantNames}`);
  tooltipLines.push(formatRelativeTime(lastActiveAt, false));
  const tooltip = tooltipLines.join('\n');

  return (
    <div
      className={`ui-thread-item group relative cursor-pointer transition-colors ${
        indented ? 'pl-7' : ''
      } mx-4 mb-1 last:mb-0 border-0 border-b-0 ${isActive ? 'ui-thread-item-active bg-white rounded-[8px]' : 'ui-thread-item-inactive rounded-[8px]'}`}
      onClick={() => onSelect(id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
      title={tooltip}
    >
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          {participants.length > 0 ? (
            <CatAvatar catId={participants[0]!} size={32} />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--text-muted)]">
              <PawIcon className="h-4 w-4" />
            </div>
          )}
          {showUnreadBadge && (
            <span
              className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-medium leading-none text-white"
              aria-label={`未读消息 ${unreadCount}`}
            >
              {unreadLabel}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="ui-thread-title block min-w-0 flex-1 truncate">{displayTitle}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="block min-w-0 flex-1 truncate text-[12px] text-[var(--text-muted)]">{description}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              {sourceLabel && (
                <span className="rounded-full bg-[rgba(20,118,255,0.1)] px-2 py-[1px] text-[10px] leading-4 text-[rgba(20,118,255,1)]">
                  {sourceLabel}
                </span>
              )}
              <span className="ui-thread-meta shrink-0">{formatRelativeTime(lastActiveAt, true)}</span>
            </div>
          </div>
        </div>
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 inline-block rounded-lg border border-[var(--border-default)] bg-[var(--surface-panel)] p-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {canRename && (
            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                setDraftTitle(title ?? '');
                setShowRenameDialog(true);
              }}
              className="block whitespace-nowrap rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--accent-soft)]"
            >
              重命名
            </button>
          )}

          {canPin && (
            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                void onTogglePin?.(id, !isPinned);
              }}
              className="block whitespace-nowrap rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--accent-soft)]"
            >
              {isPinned ? '取消置顶' : '置顶'}
            </button>
          )}

          {canFavorite && (
            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                void onToggleFavorite?.(id, !isFavorited);
              }}
              className="block whitespace-nowrap rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--accent-soft)]"
            >
              {isFavorited ? '取消收藏' : '收藏'}
            </button>
          )}

          {id !== 'default' && (
            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                window.open(`${API_URL}/api/export/thread/${id}?format=md`);
              }}
              className="block whitespace-nowrap rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--accent-soft)]"
            >
              导出对话
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                onDelete?.(id);
              }}
              className="block whitespace-nowrap rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--accent-soft)]"
            >
              删除对话
            </button>
          )}
        </div>
      )}

      {showRenameDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4"
          onClick={() => setShowRenameDialog(false)}
        >
          <div
            className="w-[500px] rounded-2xl border border-[#E5EAF0] bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-bold text-gray-900">编辑会话名称</h3>
                <button
                  type="button"
                  onClick={() => setShowRenameDialog(false)}
                  aria-label="close"
                  className="flex h-6 w-6 items-center justify-center rounded text-[#5F6775] transition-colors hover:bg-[#F7F8FA]"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void submitRename();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setShowRenameDialog(false);
                  }
                }}
                autoFocus
                maxLength={200}
                disabled={isSaving}
                className="ui-field h-7 w-full px-3 text-sm"
              />

              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setShowRenameDialog(false)} className="ui-button-secondary">
                  取消
                </button>
                <button type="button" onClick={() => void submitRename()} disabled={isSaving} className="ui-button-primary">
                  确定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
