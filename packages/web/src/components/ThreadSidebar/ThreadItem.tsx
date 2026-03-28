import { useCallback, useEffect, useRef, useState } from 'react';
import { useCatData } from '@/hooks/useCatData';
import type { ThreadState } from '@/stores/chat-types';
import { API_URL } from '@/utils/api-client';
import { CatAvatar } from '../CatAvatar';
import { HubIcon } from '../icons/HubIcon';
import { PawIcon } from '../icons/PawIcon';
import { ThreadCatStatus } from '../ThreadCatStatus';
import { ThreadCatSettings } from './ThreadCatSettings';
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
  onUpdatePreferredCats,
  isPinned,
  isFavorited,
  threadState,
  indented,
  preferredCats,
  isHubThread,
}: ThreadItemProps) {
  const { getCatById } = useCatData();
  const canDelete = id !== 'default' && onDelete;
  const canRename = id !== 'default' && onRename;
  const canPin = id !== 'default' && onTogglePin;
  const canFavorite = id !== 'default' && onToggleFavorite;
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);

  useEffect(() => {
    if (!isEditing) setDraftTitle(title ?? '');
  }, [title, isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  const submitRename = useCallback(async () => {
    if (!onRename) return;
    const next = draftTitle.trim();
    if (!next) {
      setDraftTitle(title ?? '');
      setIsEditing(false);
      return;
    }
    if (next === (title ?? '')) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onRename(id, next);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }, [onRename, draftTitle, title, id]);

  const displayTitle = title ?? (id === 'default' ? '大厅' : '未命名对话');
  const participantNames = participants.map((catId) => getCatById(catId)?.displayName ?? catId).join(', ');
  const tooltipLines = [displayTitle];
  if (participantNames) tooltipLines.push(`参与: ${participantNames}`);
  tooltipLines.push(formatRelativeTime(lastActiveAt, false));
  const tooltip = tooltipLines.join('\n');

  return (
    <div
      className={`ui-thread-item group relative cursor-pointer transition-colors ${
        indented ? 'pl-7 pr-3' : 'px-3'
      } ${isActive ? 'ui-thread-item-active' : 'ui-thread-item-inactive'}`}
      onClick={() => onSelect(id)}
      title={tooltip}
    >
      <div className="mb-1 flex items-start justify-between gap-1">
        {isEditing ? (
          <input
            ref={inputRef}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isComposingRef.current) {
                e.preventDefault();
                void submitRename();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setDraftTitle(title ?? '');
                setIsEditing(false);
              }
            }}
            onBlur={() => {
              void submitRename();
            }}
            disabled={isSaving}
            maxLength={200}
            className="ui-field mr-2 w-full px-2 py-1 text-[13px] disabled:opacity-70"
          />
        ) : (
          <span className="ui-thread-title line-clamp-2 flex-1 min-w-0 leading-snug">
            {isHubThread && <HubIcon className="mr-1 inline-block h-3.5 w-3.5 align-text-bottom text-[var(--text-accent)]" />}
            {displayTitle}
          </span>
        )}
        <div className="mt-0.5 flex flex-shrink-0 items-center gap-0.5">
          {canPin && !isEditing && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void onTogglePin(id, !isPinned);
              }}
              className={`ui-thread-action p-0.5 ${
                isPinned ? 'text-[var(--text-accent)]' : 'text-[var(--text-muted)] opacity-0 group-hover:opacity-100'
              }`}
              title={isPinned ? '取消置顶' : '置顶'}
            >
              <PinIcon />
            </button>
          )}
          {canFavorite && !isEditing && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void onToggleFavorite(id, !isFavorited);
              }}
              className={`ui-thread-action p-0.5 ${
                isFavorited ? 'text-amber-500' : 'text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-amber-500'
              }`}
              title={isFavorited ? '取消收藏' : '收藏'}
            >
              <StarIcon filled={isFavorited} />
            </button>
          )}
          {id !== 'default' && onUpdatePreferredCats && !isEditing && (
            <ThreadCatSettings threadId={id} currentCats={preferredCats ?? []} onSave={onUpdatePreferredCats} />
          )}
          {canRename && !isEditing && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="ui-thread-action opacity-0 group-hover:opacity-100 p-0.5"
              title="重命名对话"
            >
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11.013 1.427a1.75 1.75 0 112.474 2.474l-7.2 7.2a2 2 0 01-.84.49l-2.22.634a.75.75 0 01-.926-.926l.634-2.22a2 2 0 01.49-.84l7.588-7.588zm1.414 1.06a.25.25 0 00-.353 0L11.2 3.36l1.44 1.44.874-.874a.25.25 0 000-.353l-1.086-1.086zM11.58 5.86l-1.44-1.44-6.072 6.072a.5.5 0 00-.123.21l-.303 1.06 1.06-.303a.5.5 0 00.21-.123l6.668-6.668z" />
                <path d="M2.25 13A.75.75 0 013 12.25v-.5a.75.75 0 011.5 0v.5c0 .138.112.25.25.25h8a.75.75 0 010 1.5h-8A1.75 1.75 0 012.25 13z" />
              </svg>
            </button>
          )}
          {id !== 'default' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.open(`${API_URL}/api/export/thread/${id}?format=md`);
              }}
              className="ui-thread-action opacity-0 group-hover:opacity-100 p-0.5 hover:text-sky-500"
              title="导出对话"
            >
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2.75 14A1.75 1.75 0 011 12.25v-2.5a.75.75 0 011.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-2.5a.75.75 0 011.5 0v2.5A1.75 1.75 0 0113.25 14H2.75z" />
                <path d="M7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.749.749 0 111.06 1.06l-3.25 3.25a.749.749 0 01-1.06 0L4.22 6.78a.749.749 0 111.06-1.06l1.97 1.969z" />
              </svg>
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(id);
              }}
              className="ui-thread-action opacity-0 group-hover:opacity-100 p-0.5 hover:text-rose-500"
              title="删除对话"
            >
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11v-.75A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3v-.75a.75.75 0 00-.75-.75h-1.5z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {participants.length > 0 ? (
            participants.map((catId) => <CatAvatar key={catId} catId={catId} size={16} />)
          ) : id !== 'default' ? (
            <>
              <PawIcon className="h-3 w-3 text-[var(--text-muted)]" />
              <span className="ui-thread-meta">还没有猫猫加入</span>
            </>
          ) : null}
          {preferredCats && preferredCats.length > 0 && (
            <div
              className="ml-1 flex items-center gap-0.5"
              title={`默认: ${preferredCats.map((catId) => getCatById(catId)?.displayName ?? catId).join(', ')}`}
            >
              <span className="ui-thread-meta">默认</span>
              {preferredCats.map((catId) => (
                <span
                  key={catId}
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: getCatById(catId)?.color.primary ?? '#9CA3AF' }}
                />
              ))}
            </div>
          )}
          {threadState && (
            <ThreadCatStatus
              threadState={threadState}
              unreadCount={threadState.unreadCount}
              hasUserMention={threadState.hasUserMention}
            />
          )}
        </div>
        <span className="ui-thread-meta flex-shrink-0">{formatRelativeTime(lastActiveAt, true)}</span>
      </div>
    </div>
  );
}

function PinIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4.456 2.013a.75.75 0 011.06-.034l6.5 6a.75.75 0 01-.034 1.06l-1.99 1.838.637 3.22a.75.75 0 01-1.196.693L6.5 12.526l-2.933 2.264a.75.75 0 01-1.196-.693l.637-3.22-1.99-1.838a.75.75 0 01-.034-1.06l5.472-5.966z" />
    </svg>
  );
}

function StarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 16 16"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.2"
    >
      <path d="M8 1.5l2.09 4.26 4.71.68-3.41 3.32.8 4.69L8 12.26l-4.19 2.19.8-4.69L1.2 6.44l4.71-.68L8 1.5z" />
    </svg>
  );
}
