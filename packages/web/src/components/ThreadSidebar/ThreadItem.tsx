/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCatData } from '@/hooks/useCatData';
import { getMentionLabel, getMentionRe, getMentionToCat } from '@/lib/mention-highlight';
import type { ThreadState } from '@/stores/chat-types';
import { API_URL } from '@/utils/api-client';
import { AppModal } from '../AppModal';
import { OverflowTooltip } from '../shared/OverflowTooltip';
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

type ContextMenuState = {
  x: number;
  y: number;
  anchorLeft: number;
  anchorTop: number;
  anchorBottom: number;
};

function resolveMoreMenuAnchor(container: HTMLDivElement, fallbackEvent?: MouseEvent) {
  const moreButton = container.querySelector<HTMLButtonElement>('button[aria-label="更多操作"]');
  if (moreButton) {
    const rect = moreButton.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return { left: rect.left, top: rect.top, bottom: rect.bottom };
    }
  }

  const rowRect = container.getBoundingClientRect();
  const fallbackLeft = rowRect.right - 28;
  const fallbackTop = rowRect.top + rowRect.height * 0.62;
  const fallbackBottom = fallbackTop + 16;
  if (fallbackEvent) {
    return { left: fallbackLeft, top: fallbackTop, bottom: fallbackBottom, x: fallbackEvent.clientX, y: fallbackEvent.clientY };
  }
  return { left: fallbackLeft, top: fallbackTop, bottom: fallbackBottom };
}

function getMentionedCatIdsFromMessages(
  messages: ThreadState['messages'] | undefined,
  getCatById: (id: string) => unknown,
): string[] {
  if (!messages?.length) return [];
  const mentionToCat = getMentionToCat();
  const mentionRe = getMentionRe();
  const ids: string[] = [];
  const seen = new Set<string>();

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (!message?.content) continue;

    mentionRe.lastIndex = 0;
    const matches = [...message.content.matchAll(mentionRe)];
    for (const match of matches) {
      const alias = match[1]?.toLowerCase();
      if (!alias) continue;
      const candidateId = mentionToCat[alias] ?? match[1];
      if (!candidateId) continue;
      if (!getCatById(candidateId)) continue;
      if (seen.has(candidateId)) continue;
      seen.add(candidateId);
      ids.push(candidateId);
    }
  }

  return ids;
}

function getRecentAssistantCatIdsFromMessages(
  messages: ThreadState['messages'] | undefined,
  getCatById: (id: string) => unknown,
): string[] {
  if (!messages?.length) return [];

  const ids: string[] = [];
  const seen = new Set<string>();

  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    const catId = message?.type === 'assistant' ? message.catId : undefined;
    if (!catId) continue;
    if (seen.has(catId)) continue;
    if (!getCatById(catId)) continue;
    seen.add(catId);
    ids.push(catId);
  }

  return ids;
}

function normalizeTitleMentions(
  title: string,
  cats: Array<{ id: string; displayName: string; mentionPatterns: string[] }>,
): string {
  const mentionLabel = getMentionLabel();
  const knownAliases = new Set<string>(Object.keys(mentionLabel).map((alias) => alias.toLowerCase()));

  for (const cat of cats) {
    const display = cat.displayName.trim();
    if (!display) continue;
    knownAliases.add(cat.id.toLowerCase());
    knownAliases.add(display.replace(/^@/, '').toLowerCase());
    for (const pattern of cat.mentionPatterns) {
      const alias = pattern.replace(/^@/, '').trim().toLowerCase();
      if (alias) knownAliases.add(alias);
    }
  }

  const tokenRe = /@([^\s,.:;!?()\[\]{}<>，。！？、：；（）【】《》「」『』〈〉]+)/g;
  return title
    .replace(tokenRe, (fullMatch: string, alias: string) => (knownAliases.has(alias.toLowerCase()) ? '' : fullMatch))
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.:;!?，。！？、：；])/g, '$1')
    .trim();
}

type ThreadFallbackAvatarMeta = {
  avatar: string;
  color: string;
  displayName: string;
};

function resolveThreadFallbackAvatar(
  cats: Array<{ id: string; displayName: string; mentionPatterns: string[]; avatar: string; color?: { primary?: string } }>,
): ThreadFallbackAvatarMeta {
  const officeCat =
    cats.find((cat) => cat.id.toLowerCase() === 'office') ??
    cats.find((cat) => cat.id.toLowerCase() === 'jiuwenclaw') ??
    cats.find((cat) => cat.mentionPatterns.some((pattern) => pattern.replace(/^@/, '').toLowerCase() === 'office')) ??
    cats.find((cat) => cat.displayName.includes('办公'));

  const avatar = officeCat?.avatar?.trim() ?? '';
  return {
    avatar: avatar ? (avatar.startsWith('/uploads/') ? `${API_URL}${avatar}` : avatar) : '/avatars/assistant.svg',
    color: officeCat?.color?.primary ?? 'var(--accent-primary)',
    displayName: officeCat?.displayName ?? '办公智能体',
  };
}

function isImageAvatar(avatar: string): boolean {
  return /^(https?:\/\/|\/|data:image)/.test(avatar);
}

function getAvatarInitial(name?: string): string {
  const normalized = (name ?? '').replace(/^@/, '').trim();
  const first = normalized.slice(0, 1);
  return (first || '智').toUpperCase();
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
  isPinned,
  threadState,
  indented,
  preferredCats,
  isHubThread,
  sourceLabel,
}: ThreadItemProps) {
  const { cats = [], getCatById } = useCatData();
  const unreadCount = Math.max(0, threadState?.unreadCount ?? 0);
  const showUnreadBadge = unreadCount > 0;
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const isThreadRunning = !!threadState?.hasActiveInvocation;
  const canDelete = id !== 'default' && onDelete && !isThreadRunning;
  const canRename = id !== 'default' && onRename;
  const canPin = id !== 'default' && onTogglePin;

  const [isSaving, setIsSaving] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title ?? '');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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
    const anchorGap = 6;
    const rect = menuRef.current.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - viewportPadding;
    const nextX = Math.min(
      Math.max(contextMenu.anchorLeft, viewportPadding),
      Math.max(viewportPadding, maxX),
    );

    const topBoundY = viewportPadding;
    const bottomBoundY = Math.max(viewportPadding, window.innerHeight - rect.height - viewportPadding);
    const preferredBelowY = contextMenu.anchorBottom + anchorGap;
    const preferredAboveY = contextMenu.anchorTop - rect.height - anchorGap;
    const fitsBelow = preferredBelowY + rect.height <= window.innerHeight - viewportPadding;
    const targetRawY = fitsBelow ? preferredBelowY : preferredAboveY;
    const nextY = Math.min(Math.max(targetRawY, topBoundY), bottomBoundY);

    if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
      setContextMenu({
        x: nextX,
        y: nextY,
        anchorLeft: contextMenu.anchorLeft,
        anchorTop: contextMenu.anchorTop,
        anchorBottom: contextMenu.anchorBottom,
      });
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

  const rawTitle = title ?? (id === 'default' ? '大厅' : '未命名会话');
  const displayTitle = normalizeTitleMentions(rawTitle, cats);
  const recentAssistantCatIds = getRecentAssistantCatIdsFromMessages(threadState?.messages, getCatById);
  const recentAssistantNames = recentAssistantCatIds.map((catId) => getCatById(catId)?.displayName ?? catId).join(', ');
  const participantNames = participants.map((catId) => getCatById(catId)?.displayName ?? catId).join(', ');
  const description = recentAssistantNames || participantNames || (isHubThread ? 'Hub 会话' : '暂无智能体');
  const fallbackAvatar = resolveThreadFallbackAvatar(cats);
  const mentionedCatIds = getMentionedCatIdsFromMessages(threadState?.messages, getCatById);
  const fallbackAvatarCatIds = Array.from(
    new Set(
      [...(threadState?.targetCats ?? []), ...participants, ...(preferredCats ?? []), ...mentionedCatIds].filter(
        (catId) => !!catId && !!getCatById(catId),
      ),
    ),
  );
  const avatarCatIds = (recentAssistantCatIds.length > 0 ? recentAssistantCatIds : fallbackAvatarCatIds).slice(0, 4);
  const contextMenuItemClass =
    'ui-overlay-item block w-full whitespace-nowrap rounded-[4px] px-3 py-2 text-left text-xs text-[var(--overlay-text)] transition-colors focus-visible:outline-none';
  const isContextMenuOpen = contextMenu !== null;
  const openContextMenu = useCallback((anchorLeft: number, anchorTop: number, anchorBottom: number) => {
    setContextMenu({
      x: anchorLeft,
      y: anchorBottom + 6,
      anchorLeft,
      anchorTop,
      anchorBottom,
    });
  }, []);

  const renderCatAvatar = useCallback(
    (catId: string, size: number) => {
      const cat = getCatById(catId);
      const avatar = cat?.avatar?.trim() ?? '';
      const avatarSrc = avatar.startsWith('/uploads/') ? `${API_URL}${avatar}` : avatar;
      const imageAvatar = isImageAvatar(avatarSrc);

      if (imageAvatar) {
        return (
          <div className="overflow-hidden rounded-full bg-gray-100" style={{ width: size, height: size }}>
            <img
              src={avatarSrc}
              alt={cat?.displayName ?? catId}
              width={size}
              height={size}
              className="h-full w-full object-cover"
            />
          </div>
        );
      }

      return (
        <div
          className="inline-flex items-center justify-center rounded-full font-semibold text-[var(--thread-avatar-initial-text)]"
          style={{
            width: size,
            height: size,
            backgroundColor: cat?.color?.primary ?? 'var(--accent-primary)',
            fontSize: size <= 16 ? 10 : 12,
            lineHeight: 1,
          }}
          aria-hidden="true"
          title={cat?.displayName ?? catId}
        >
          {avatar || getAvatarInitial(cat?.displayName ?? catId)}
        </div>
      );
    },
    [getCatById],
  );

  return (
    <div
      className={`ui-thread-item group relative cursor-pointer transition-colors ${
        indented ? 'pl-7' : ''
      } mx-4 mb-1 last:mb-0 border-0 border-b-0 rounded-[8px] ${isActive ? 'ui-thread-item-active' : 'ui-thread-item-inactive'}`}
      onClick={() => onSelect(id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const anchor = resolveMoreMenuAnchor(e.currentTarget, e.nativeEvent);
        openContextMenu(anchor.left, anchor.top, anchor.bottom);
      }}
    >
      <div className="flex items-center gap-[10px]">
        <div className="relative shrink-0">
          {avatarCatIds.length === 1 ? (
            renderCatAvatar(avatarCatIds[0]!, 32)
          ) : avatarCatIds.length > 1 ? (
            <div className="relative h-8 w-8">
              {avatarCatIds.length === 2 && (
                <>
                  <div className="absolute left-[1px] top-[6px] z-10">
                    {renderCatAvatar(avatarCatIds[0]!, 20)}
                  </div>
                  <div className="absolute left-[11px] top-[6px] z-0">
                    {renderCatAvatar(avatarCatIds[1]!, 20)}
                  </div>
                </>
              )}
              {avatarCatIds.length === 3 && (
                <>
                  <div className="absolute left-[8px] top-0">
                    {renderCatAvatar(avatarCatIds[0]!, 16)}
                  </div>
                  <div className="absolute left-0 top-[16px]">
                    {renderCatAvatar(avatarCatIds[1]!, 16)}
                  </div>
                  <div className="absolute left-[16px] top-[16px]">
                    {renderCatAvatar(avatarCatIds[2]!, 16)}
                  </div>
                </>
              )}
              {avatarCatIds.length >= 4 && (
                <>
                  <div className="absolute left-0 top-0">
                    {renderCatAvatar(avatarCatIds[0]!, 16)}
                  </div>
                  <div className="absolute left-[16px] top-0">
                    {renderCatAvatar(avatarCatIds[1]!, 16)}
                  </div>
                  <div className="absolute left-0 top-[16px]">
                    {renderCatAvatar(avatarCatIds[2]!, 16)}
                  </div>
                  <div className="absolute left-[16px] top-[16px]">
                    {renderCatAvatar(avatarCatIds[3]!, 16)}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="ui-avatar-fallback-shell h-8 w-8">
              {isImageAvatar(fallbackAvatar.avatar) ? (
                <>
                  {/* biome-ignore lint/performance/noImgElement: fallback avatar uses static local asset */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fallbackAvatar.avatar} alt="" aria-hidden="true" className="h-full w-full object-cover" />
                </>
              ) : (
                <span
                  aria-hidden="true"
                  className="inline-flex h-full w-full items-center justify-center rounded-full text-[12px] font-semibold text-[var(--thread-avatar-initial-text)]"
                  style={{ backgroundColor: fallbackAvatar.color }}
                >
                  {fallbackAvatar.avatar || getAvatarInitial(fallbackAvatar.displayName)}
                </span>
              )}
            </div>
          )}
          {showUnreadBadge && (
            <span
              className="ui-thread-unread-badge absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border px-1 text-[10px] font-medium leading-none"
              aria-label={`未读消息 ${unreadCount}`}
            >
              {unreadLabel}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <OverflowTooltip content={displayTitle} className="min-w-0 flex-1">
              <span className="ui-thread-title block min-w-0 truncate font-semibold">{displayTitle}</span>
            </OverflowTooltip>
            {sourceLabel && (
              <span className="ui-thread-source-badge shrink-0 rounded-full px-2 py-[1px] text-[10px] leading-4">
                {sourceLabel}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <OverflowTooltip content={description} className="min-w-0 flex-1">
              <span className="ui-thread-description block min-w-0 truncate">{description}</span>
            </OverflowTooltip>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className={`ui-thread-meta shrink-0 ${isContextMenuOpen ? 'hidden' : 'group-hover:hidden'}`}>
                {formatRelativeTime(lastActiveAt, true)}
              </span>
              <button
                type="button"
                aria-label="更多操作"
                className={`ui-thread-action h-4 w-4 items-center justify-center ${
                  isContextMenuOpen ? 'inline-flex' : 'hidden group-hover:inline-flex focus-visible:inline-flex'
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  openContextMenu(rect.left, rect.top, rect.bottom);
                }}
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <circle cx="10" cy="4.5" r="1.4" />
                  <circle cx="10" cy="10" r="1.4" />
                  <circle cx="10" cy="15.5" r="1.4" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          className="ui-overlay-card fixed z-50 inline-block w-[100px] rounded-[6px] py-2 shadow-[var(--overlay-shadow)]"
          data-testid="thread-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {canRename && (
            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                setDraftTitle(title ?? '');
                setShowRenameDialog(true);
              }}
              className={contextMenuItemClass}
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
              className={contextMenuItemClass}
            >
              {isPinned ? '取消置顶' : '置顶'}
            </button>
          )}

          {id !== 'default' && (
            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                window.open(`${API_URL}/api/export/thread/${id}?format=md`);
              }}
              className={contextMenuItemClass}
            >
              导出会话
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => {
                setContextMenu(null);
                onDelete?.(id);
              }}
              className={contextMenuItemClass}
            >
              删除会话
            </button>
          )}
        </div>
      )}

      <AppModal
        open={showRenameDialog}
        onClose={() => setShowRenameDialog(false)}
        disableBackdropClose
        title="编辑会话名称"
        panelClassName="w-[500px]"
        bodyClassName="pt-5"
        zIndexClassName="z-[60]"
        backdropTestId="thread-rename-modal"
        panelTestId="thread-rename-modal-panel"
      >
        <div className="flex flex-col gap-5" data-testid="thread-rename-modal-content">
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
            className="ui-input h-7 w-full px-3 text-sm"
          />

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setShowRenameDialog(false)} className="ui-button-default">
              取消
            </button>
            <button type="button" onClick={() => void submitRename()} disabled={isSaving} className="ui-button-primary">
              确定
            </button>
          </div>
        </div>
      </AppModal>
    </div>
  );
}
