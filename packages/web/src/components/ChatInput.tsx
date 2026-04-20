/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import {
  type CSSProperties,
  KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { QUICK_ACTIONS, type QuickActionConfig } from '@/config/quick-actions';
import { useCatData } from '@/hooks/useCatData';
import { usePathCompletion } from '@/hooks/usePathCompletion';
import type { UploadStatus, WhisperOptions } from '@/hooks/useSendMessage';
import type { DeliveryMode } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';
import { useInputHistoryStore } from '@/stores/inputHistoryStore';
import { useToastStore } from '@/stores/toastStore';
import {
  fetchSkillOptionsWithCache,
  SKILL_OPTIONS_UPDATED_EVENT,
  type SkillOption,
  seedSkillOptionsCache,
} from '@/utils/skill-options-cache';
import { ChatInputActionButton } from './ChatInputActionButton';
import { ChatInputMenus } from './ChatInputMenus';
import { buildCatOptions, buildWhisperOptions, type CatOption, detectMenuTrigger } from './chat-input-options';
import { deriveImageLifecycleStatus, isImageLifecycleBlockingSend } from './chat-input-upload-state';
import { HistorySearchModal } from './HistorySearchModal';
import { ImagePreview } from './ImagePreview';
import { AttachIcon } from './icons/AttachIcon';
import { MobileInputToolbar } from './MobileInputToolbar';
import { PathCompletionMenu } from './PathCompletionMenu';
import { RichTextarea, type RichTextareaHandle } from './RichTextarea';
import { OverflowTooltip } from './shared/OverflowTooltip';

/** Module-level draft storage — survives component unmount/remount across thread switches */
export const threadDrafts = new Map<string, string>();

function FolderBadgeIcon({ className }: { className?: string }) {
  return (
    <img
      data-testid="folder-select-icon"
      aria-hidden="true"
      className={className}
      src="/icons/chart/folder.svg"
      alt=""
    />
  );
}

interface ChatInputProps {
  /** Thread ID for draft persistence — drafts are saved per-thread */
  threadId?: string;
  onSend: (content: string, images?: File[], whisper?: WhisperOptions, deliveryMode?: DeliveryMode) => void;
  onStop?: () => void;
  disabled?: boolean;
  hasActiveInvocation?: boolean;
  uploadStatus?: UploadStatus;
  uploadError?: string | null;
  folderSelectionEnabled?: boolean;
  selectedFolderName?: string | null;
  selectedFolderTitle?: string | null;
  onOpenFolderPicker?: () => void;
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  '.pdf',
  '.docx',
  '.xlsx',
  '.pptx',
  '.txt',
  '.csv',
].join(',');
const SUPPORTED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);
const SUPPORTED_ATTACHMENT_EXTENSIONS = new Set(['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv']);
const UNSUPPORTED_FILE_TYPE_MESSAGE = '该附件类型暂不支持';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const FILE_SIZE_EXCEEDED_MESSAGE = '文件大小超过限制，最大支持 10MB';
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TEXTAREA_MIN_HEIGHT = 70;
const TEXTAREA_MAX_HEIGHT = 260;
const MAX_INPUT_LENGTH = 5000;
const MAX_ATTACHMENT_FILES = 5;
const SKILL_TOKEN_PREFIX = '[[skill:';
const SKILL_TOKEN_SUFFIX = ']]';
const QUICK_ACTION_TOKEN_PREFIX = '[[quick_action:';
const QUICK_ACTION_TOKEN_SUFFIX = ']]';
const QUICK_ACTION_BUTTON_CLASS =
  'inline-flex items-center gap-1 rounded-[20px] border border-[var(--border-default)] bg-[var(--surface-panel)] px-3 py-1.5 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--overlay-item-hover-bg)] disabled:cursor-not-allowed disabled:opacity-50';
const QUICK_PROMPT_BUTTON_CLASS =
  'min-w-0 rounded-[16px] border border-[var(--border-default)] bg-[var(--surface-panel)] px-4 py-2 text-left text-[14px] font-normal leading-[22px] text-[var(--text-primary)] transition-colors hover:bg-[var(--overlay-item-hover-bg)]';
const EXPERT_CARD_BUTTON_CLASS =
  'group min-w-0 rounded-[16px] border border-[var(--border-default)] bg-[var(--surface-panel)] px-4 py-3 text-left transition-colors hover:bg-[var(--overlay-item-hover-bg)] hover:border-[var(--border-accent)]';
const SKILL_TRIGGER_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--surface-panel)] px-3 py-[7px] text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--overlay-item-hover-bg)]';
const SKILL_MENU_CLASS =
  'ui-overlay-card absolute bottom-full left-0 mb-2 z-[200] flex w-[240px] flex-col overflow-hidden rounded-xl border border-[var(--overlay-border)] p-2 shadow-[var(--overlay-shadow)]';
const SKILL_MENU_ITEM_CLASS =
  'flex h-[32px] w-full items-center gap-2 rounded-[6px] px-2 py-[7px] text-left text-[12px] font-normal text-[var(--overlay-text)] transition-colors';
const ICON_BUTTON_CLASS =
  'inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-label-secondary)] transition-colors hover:bg-[var(--overlay-item-hover-bg)] hover:text-[var(--text-accent)] disabled:cursor-not-allowed disabled:opacity-30';

function getSkillToken(name: string): string {
  return `${SKILL_TOKEN_PREFIX}${name}${SKILL_TOKEN_SUFFIX}`;
}

function getQuickActionToken(label: string): string {
  return `${QUICK_ACTION_TOKEN_PREFIX}${label}${QUICK_ACTION_TOKEN_SUFFIX}`;
}

function clampInputLength(value: string): string {
  if (value.length <= MAX_INPUT_LENGTH) return value;
  return value.slice(0, MAX_INPUT_LENGTH);
}

function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  if (parts.length <= 1) return '';
  return parts[parts.length - 1]?.toLowerCase() ?? '';
}

function isSupportedAttachmentFile(file: File): boolean {
  if (SUPPORTED_ATTACHMENT_MIME_TYPES.has(file.type)) return true;
  const ext = getFileExtension(file.name);
  return SUPPORTED_ATTACHMENT_EXTENSIONS.has(ext);
}

function normalizeQuickActionsForSend(input: string): string {
  let output = input;
  for (const action of QUICK_ACTIONS) {
    const token = getQuickActionToken(action.label);
    output = output.split(token).join(action.label);
  }
  return output;
}

function normalizeMentionsForSend(input: string, catOptions: CatOption[]): string {
  let output = input;
  for (const option of catOptions) {
    const routeToken = option.insert.trim();
    if (!routeToken.startsWith('@')) continue;
    const displayMentionBase = option.label.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const displayMention = displayMentionBase.startsWith('@') ? displayMentionBase : `@${displayMentionBase}`;
    if (!displayMention || displayMention.toLowerCase() === routeToken.toLowerCase()) continue;
    const re = new RegExp(`(^|\\s)${escapeRegExp(displayMention)}(?=\\s|$)`, 'gi');
    output = output.replace(re, `$1${routeToken}`);
  }
  return output;
}

function normalizeSkillsForSend(input: string): string {
  return input.replace(/\[\[skill:([^\]]+)\]\]/g, (_match, rawName: string) => {
    const name = rawName.trim();
    return name ? `使用 ${name} 技能` : '';
  });
}

function getSkillInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [initial] = Array.from(trimmed);
  return /[a-z]/i.test(initial) ? initial.toUpperCase() : initial;
}

function mergeFilesByName(
  prev: File[],
  incoming: File[],
  maxCount = MAX_ATTACHMENT_FILES,
): { files: File[]; dropped: number } {
  const next = [...prev];
  let dropped = 0;
  for (const file of incoming) {
    const normalizedName = file.name.toLowerCase();
    const existingIndex = next.findIndex((item) => item.name.toLowerCase() === normalizedName);
    if (existingIndex >= 0) {
      next[existingIndex] = file;
      continue;
    }
    if (next.length >= maxCount) {
      dropped += 1;
      continue;
    }
    next.push(file);
  }
  return { files: next.slice(0, maxCount), dropped };
}

function SkillOptionIcon({ name, iconUrl }: { name: string; iconUrl?: string | null }) {
  if (iconUrl && iconUrl.trim()) {
    return <img src={iconUrl} alt="" aria-hidden="true" className="h-4 w-4 shrink-0 rounded-[4px] object-cover" />;
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[20px] bg-[var(--accent-soft)] text-[10px] font-semibold text-[var(--text-accent)]"
    >
      {getSkillInitial(name)}
    </span>
  );
}

export function ChatInput({
  threadId,
  onSend,
  onStop,
  disabled,
  hasActiveInvocation,
  uploadStatus = 'idle',
  uploadError = null,
  folderSelectionEnabled = false,
  selectedFolderName = null,
  selectedFolderTitle = null,
  onOpenFolderPicker,
}: ChatInputProps) {
  const { cats } = useCatData();
  const catOptions = useMemo(() => buildCatOptions(cats), [cats]);
  const replaceThreadTargetCats = useChatStore((s) => s.replaceThreadTargetCats);
  const whisperOptions = useMemo(() => buildWhisperOptions(cats), [cats]);

  // F122B AC-B10: track which cats are actively executing (for whisper disable)
  const activeInvocations = useChatStore((s) => s.activeInvocations);
  const storeTargetCats = useChatStore((s) => s.targetCats);
  const activeCatIds = useMemo(() => {
    const ids = new Set<string>();
    for (const inv of Object.values(activeInvocations ?? {})) {
      ids.add(inv.catId);
    }
    // Defensive fallback: legacy paths set hasActiveInvocation=true without
    // populating activeInvocations slots. Use targetCats as degraded source.
    if (ids.size === 0 && hasActiveInvocation && storeTargetCats?.length) {
      for (const catId of storeTargetCats) ids.add(catId);
    }
    return ids;
  }, [activeInvocations, hasActiveInvocation, storeTargetCats]);

  const [input, setInputState] = useState(() => (threadId ? (threadDrafts.get(threadId) ?? '') : ''));
  const setInput = useCallback((next: string | ((prev: string) => string)) => {
    if (typeof next === 'function') {
      setInputState((prev) => clampInputLength((next as (prev: string) => string)(prev)));
      return;
    }
    setInputState(clampInputLength(next));
  }, []);
  const [showMentions, setShowMentions] = useState(false);
  const [showSkillMenu, setShowSkillMenu] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionEnd, setMentionEnd] = useState(-1);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionMenuStyle, setMentionMenuStyle] = useState<CSSProperties>({});
  const [skillFilter, setSkillFilter] = useState('');
  const [skillOptions, setSkillOptions] = useState<SkillOption[]>([]);
  const [skillOptionsLoading, setSkillOptionsLoading] = useState(false);
  const skillOptionsRequestSeqRef = useRef(0);
  const skillOptionsMountedRef = useRef(true);
  const [images, setImages] = useState<File[]>([]);
  const imagesRef = useRef<File[]>([]);
  const isPreparingImages = false;
  const [whisperMode, setWhisperMode] = useState(false);
  const [whisperTargets, setWhisperTargets] = useState<Set<string>>(new Set());
  const [mobileToolbar, setMobileToolbar] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [ghostSuggestion, setGhostSuggestion] = useState<string | null>(null);
  const ghostRef = useRef<string | null>(null);
  const [showHistorySearch, setShowHistorySearch] = useState(false);
  const [selectedQuickAction, setSelectedQuickAction] = useState<QuickActionConfig | null>(null);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const [pendingQuickPromptExpand, setPendingQuickPromptExpand] = useState(false);
  /** 标记专家团思辨卡片是否已点击（用于控制卡片隐藏） */
  const expertCardClickedRef = useRef(false);
  const textareaRef = useRef<RichTextareaHandle>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const skillBtnRef = useRef<HTMLButtonElement>(null);
  const skillOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const skillInsertAnchorRef = useRef<{ start: number; end: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageLifecycleStatus = deriveImageLifecycleStatus(isPreparingImages, uploadStatus);
  const sendTemporarilyDisabled = isImageLifecycleBlockingSend(imageLifecycleStatus);
  const addToast = useToastStore((s) => s.addToast);
  const folderButtonLabel = selectedFolderName?.trim() || '选择工作空间';
  const isFolderButtonDisabled = disabled || !folderSelectionEnabled;
  const shouldShowFolderTooltip = Boolean(selectedFolderTitle?.trim());

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // F63-AC15: consume pendingChatInsert from workspace (thread-guarded)
  const pendingChatInsert = useChatStore((s) => s.pendingChatInsert);
  const setPendingChatInsert = useChatStore((s) => s.setPendingChatInsert);
  useEffect(() => {
    if (!pendingChatInsert) return;
    if (pendingChatInsert.threadId !== threadId) return;
    let nextCaret = -1;
    const isQuickActionInsert = pendingChatInsert.text.includes(QUICK_ACTION_TOKEN_PREFIX);

    setInput((prev) => {
      // Scheduled-task quick action should behave like clicking the quick-action chip:
      // clear current input, insert only the capsule token, and then show prompt chips.
      if (isQuickActionInsert) {
        const next = pendingChatInsert.text;
        nextCaret = next.length;
        return next;
      }

      const base = prev;
      const separator = base && !base.endsWith('\n') ? '\n' : '';
      const next = base + separator + pendingChatInsert.text;
      nextCaret = next.length;
      return next;
    });
    if (isQuickActionInsert) {
      setPendingQuickPromptExpand(false);
      setShowQuickPrompts(true);
    }
    setPendingChatInsert(null);
    setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const caret = nextCaret >= 0 ? nextCaret : el.getSelectionEnd();
      el.setSelectionRange(caret, caret);
    }, 0);
  }, [pendingChatInsert, setPendingChatInsert, threadId]);

  const handleTranscript = useCallback((text: string) => {
    setInput((prev) => {
      const separator = prev && !prev.endsWith(' ') ? ' ' : '';
      return prev + separator + text;
    });
  }, []);

  const applyProgrammaticInput = useCallback((next: string, caret: number) => {
    const el = textareaRef.current;
    if (el) {
      el.applyProgrammaticChange(next, caret, caret);
      return;
    }
    setInput(next);
  }, []);

  const handleQuickAction = useCallback((action: QuickActionConfig) => {
    const token = getQuickActionToken(action.label);
    const next = `${token} `;
    applyProgrammaticInput(next, next.length);
    setPendingQuickPromptExpand(false);
    setShowQuickPrompts(true);
    // 重置专家团思辨点击标记
    expertCardClickedRef.current = false;
    setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      const cursorPos = next.length;
      el.focus();
      el.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  }, []);

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      const startIdx = input.indexOf(QUICK_ACTION_TOKEN_PREFIX);
      const endIdx =
        startIdx >= 0 ? input.indexOf(QUICK_ACTION_TOKEN_SUFFIX, startIdx + QUICK_ACTION_TOKEN_PREFIX.length) : -1;

      let next = input;
      let caret = input.length;
      if (startIdx >= 0 && endIdx > startIdx) {
        const tokenEndExclusive = endIdx + QUICK_ACTION_TOKEN_SUFFIX.length;
        const before = input.slice(0, tokenEndExclusive);
        const after = input.slice(tokenEndExclusive).replace(/^\s+/, '');
        const joiner = after.length > 0 ? ' ' : '';
        next = `${before} ${prompt}${joiner}${after}`;
        caret = next.length;
      } else {
        const ta = textareaRef.current;
        const start = ta?.getSelectionStart() ?? input.length;
        const end = ta?.getSelectionEnd() ?? input.length;
        const before = input.slice(0, start);
        const after = input.slice(end);
        const leftJoiner = before.endsWith(' ') || before.length === 0 ? '' : ' ';
        const rightJoiner = after.startsWith(' ') || after.length === 0 ? '' : ' ';
        next = `${before}${leftJoiner}${prompt}${rightJoiner}${after}`;
        caret = next.length;
      }

      applyProgrammaticInput(next, caret);
      setPendingQuickPromptExpand(false);
      setShowQuickPrompts(false);
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      }, 0);
    },
    [applyProgrammaticInput, input],
  );

  /** 专家团思辨：插入@智能体和文本内容（保留胶囊token，隐藏卡片） */
  const handleExpertCardClick = useCallback(
    (agentName: string, content: string) => {
      // 注意：@智能体后必须跟空格才能被识别为mention（中文逗号不行）
      const fullText = `@${agentName} ${content}`;

      // 在token后插入内容，保留token
      const startIdx = input.indexOf(QUICK_ACTION_TOKEN_PREFIX);
      const endIdx =
        startIdx >= 0 ? input.indexOf(QUICK_ACTION_TOKEN_SUFFIX, startIdx + QUICK_ACTION_TOKEN_PREFIX.length) : -1;

      let next = input;
      let caret = 0;
      if (startIdx >= 0 && endIdx > startIdx) {
        // 在token后面插入内容，保留token
        const tokenEndExclusive = endIdx + QUICK_ACTION_TOKEN_SUFFIX.length;
        const before = input.slice(0, tokenEndExclusive);
        const after = input.slice(tokenEndExclusive).replace(/^\s+/, '');
        const joiner = ' ';
        const rightJoiner = after.length > 0 ? ' ' : '';
        next = `${before}${joiner}${fullText}${rightJoiner}${after}`;
        caret = (before + joiner + fullText).length;
      } else {
        // 没有token时，在光标位置插入
        const ta = textareaRef.current;
        const start = ta?.getSelectionStart() ?? input.length;
        const end = ta?.getSelectionEnd() ?? input.length;
        const before = input.slice(0, start);
        const after = input.slice(end);
        const leftJoiner = before.endsWith(' ') || before.length === 0 ? '' : ' ';
        const rightJoiner = after.startsWith(' ') || after.length === 0 ? '' : ' ';
        next = `${before}${leftJoiner}${fullText}${rightJoiner}${after}`;
        caret = (before + leftJoiner + fullText).length;
      }

      applyProgrammaticInput(next, caret);
      // 标记已点击卡片，隐藏卡片区域，回到胶囊按钮展示
      expertCardClickedRef.current = true;
      setShowQuickPrompts(false);
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      }, 0);
    },
    [applyProgrammaticInput, input],
  );

  const visibleQuickActions = useMemo(() => QUICK_ACTIONS.filter((action) => action.show !== false), []);

  useEffect(() => {
    const matched = visibleQuickActions.find((action) => input.includes(getQuickActionToken(action.label))) ?? null;
    setSelectedQuickAction(matched);
  }, [input, visibleQuickActions]);

  useEffect(() => {
    if (selectedQuickAction) {
      // 专家团思辨：有 expertCards 但没有 prompts
      if (selectedQuickAction.expertCards && selectedQuickAction.expertCards.length > 0) {
        // 如果已点击过卡片，则隐藏卡片区域
        if (expertCardClickedRef.current) {
          setShowQuickPrompts(false);
        } else {
          setShowQuickPrompts(true);
        }
        if (pendingQuickPromptExpand) setPendingQuickPromptExpand(false);
        return;
      }
      const hasMatchedPrompt = selectedQuickAction.prompts.some((prompt) => input.includes(prompt));
      // Rule:
      // 1) scene + matched prompt => show quick actions row (hide prompts row)
      // 2) scene only (no matched prompt) => show quick prompts row
      setShowQuickPrompts(!hasMatchedPrompt);
      if (pendingQuickPromptExpand) setPendingQuickPromptExpand(false);
      return;
    }

    if (!pendingQuickPromptExpand) setShowQuickPrompts(false);
  }, [input, pendingQuickPromptExpand, selectedQuickAction]);

  const filteredCatOptions = useMemo(() => {
    if (!mentionFilter) return catOptions;
    const lower = mentionFilter.toLowerCase();
    return catOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(lower) ||
        opt.insert.toLowerCase().includes(lower) ||
        opt.id.toLowerCase().includes(lower),
    );
  }, [catOptions, mentionFilter]);

  const filteredSkillOptions = useMemo(() => {
    const lower = skillFilter.trim().toLowerCase();
    if (!lower) return skillOptions;
    return skillOptions.filter((item) => item.name.toLowerCase().includes(lower));
  }, [skillFilter, skillOptions]);

  const loadSkillOptions = useCallback((force = false) => {
    const requestId = ++skillOptionsRequestSeqRef.current;
    setSkillOptionsLoading(true);
    void fetchSkillOptionsWithCache(force ? { force: true } : undefined)
      .then((options) => {
        if (!skillOptionsMountedRef.current || skillOptionsRequestSeqRef.current !== requestId) return;
        setSkillOptions(options);
        // Keep shared cache warm so message renderer can reuse immediately.
        seedSkillOptionsCache(options);
      })
      .finally(() => {
        if (!skillOptionsMountedRef.current || skillOptionsRequestSeqRef.current !== requestId) return;
        setSkillOptionsLoading(false);
      });
  }, []);

  useEffect(() => {
    skillOptionsMountedRef.current = true;
    loadSkillOptions();
    return () => {
      skillOptionsMountedRef.current = false;
      skillOptionsRequestSeqRef.current += 1;
    };
  }, [loadSkillOptions]);

  useEffect(() => {
    const handleSkillOptionsUpdated = () => {
      loadSkillOptions(true);
    };
    window.addEventListener(SKILL_OPTIONS_UPDATED_EVENT, handleSkillOptionsUpdated);
    return () => {
      window.removeEventListener(SKILL_OPTIONS_UPDATED_EVENT, handleSkillOptionsUpdated);
    };
  }, [loadSkillOptions]);

  const activeMenu = showMentions ? 'mention' : showSkillMenu ? 'skill' : null;
  const activeOptionsCount = activeMenu === 'mention' ? filteredCatOptions.length : filteredSkillOptions.length;

  const addHistoryEntry = useInputHistoryStore((s) => s.addEntry);
  const findHistoryMatch = useInputHistoryStore((s) => s.findMatch);

  // F080-P2: path completion
  const pathCompletion = usePathCompletion(input);

  const doSend = useCallback(
    (deliveryMode?: DeliveryMode) => {
      if (sendTemporarilyDisabled) return;
      if (whisperMode && whisperTargets.size === 0) return;
      const trimmed = input.trim();
      const payload = normalizeMentionsForSend(
        normalizeSkillsForSend(normalizeQuickActionsForSend(trimmed)),
        catOptions,
      );
      if (payload && !disabled) {
        addHistoryEntry(payload);
        const whisper =
          whisperMode && whisperTargets.size > 0
            ? { visibility: 'whisper' as const, whisperTo: [...whisperTargets] }
            : undefined;
        onSend(payload, images.length > 0 ? images : undefined, whisper, deliveryMode);
        setInput('');
        ghostRef.current = null;
        setGhostSuggestion(null);
        setImages([]);
        setShowMentions(false);
        setShowSkillMenu(false);
        setSelectedQuickAction(null);
        setPendingQuickPromptExpand(false);
        setShowQuickPrompts(false);
      }
    },
    [
      input,
      disabled,
      onSend,
      images,
      sendTemporarilyDisabled,
      whisperMode,
      whisperTargets,
      addHistoryEntry,
      catOptions,
      skillOptions,
    ],
  );

  const handleSend = useCallback(() => doSend(undefined), [doSend]);
  const handleQueueSend = useCallback(() => doSend('queue'), [doSend]);
  const handleForceSend = useCallback(() => doSend('force'), [doSend]);

  const closeMenus = useCallback(() => {
    setShowMentions(false);
    setShowSkillMenu(false);
    setSkillFilter('');
  }, []);

  const updateMentionMenuPosition = useCallback(() => {
    if (!showMentions) return;
    const ta = textareaRef.current;
    const root = ta?.getElement();
    if (!root) return;
    const offset = mentionStart >= 0 ? mentionStart : (ta?.getSelectionStart() ?? 0);
    const anchorRect = ta?.getClientRectAtOffset(offset) ?? root.getBoundingClientRect();
    const menuWidth = 200;
    const menuHeight = Math.max(120, menuRef.current?.offsetHeight ?? 220);
    const viewportPadding = 8;
    const desiredLeft = anchorRect.left;
    const desiredTop = anchorRect.top - menuHeight - 8;
    const maxLeft = window.innerWidth - menuWidth - viewportPadding;
    const maxTop = window.innerHeight - menuHeight - viewportPadding;
    const left = Math.min(Math.max(desiredLeft, viewportPadding), Math.max(viewportPadding, maxLeft));
    const top = Math.min(Math.max(desiredTop, viewportPadding), Math.max(viewportPadding, maxTop));
    setMentionMenuStyle({ left, top });
  }, [showMentions, mentionStart]);

  const insertMention = useCallback(
    (option: CatOption) => {
      const cursor = textareaRef.current?.getSelectionStart() ?? input.length;
      const start = mentionStart >= 0 ? mentionStart : cursor;
      const end = mentionEnd >= start ? mentionEnd : cursor;
      const before = input.slice(0, start);
      const after = input.slice(end);
      const displayMention = option.label.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const mentionText = displayMention.startsWith('@') ? displayMention : `@${displayMention}`;
      const leftJoiner = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
      const rightJoiner = ' ';
      const normalizedAfter = after.replace(/^\s+/, '');
      const nextValue = `${before}${leftJoiner}${mentionText}${rightJoiner}${normalizedAfter}`;
      setInput(nextValue);
      setShowMentions(false);
      setMentionStart(-1);
      setMentionEnd(-1);
      setMentionFilter('');
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        const cursorPos = (before + leftJoiner + mentionText + rightJoiner).length;
        el.focus();
        el.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    },
    [input, mentionEnd, mentionStart],
  );

  const insertSkill = useCallback(
    (skillName: string) => {
      const ta = textareaRef.current;
      const anchor = skillInsertAnchorRef.current;
      const start = anchor?.start ?? ta?.getSelectionStart() ?? input.length;
      const end = anchor?.end ?? ta?.getSelectionEnd() ?? input.length;
      const before = input.slice(0, start);
      const after = input.slice(end);
      const leftJoiner = before.endsWith(' ') ? '' : ' ';
      const rightJoiner = ' ';
      const normalizedAfter = after.replace(/^\s+/, '');
      const triggerText = getSkillToken(skillName);
      const next = `${before}${leftJoiner}${triggerText}${rightJoiner}${normalizedAfter}`;
      setInput(next);
      setShowSkillMenu(false);
      setSkillFilter('');
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        const cursorPos = (before + leftJoiner + triggerText + rightJoiner).length;
        skillInsertAnchorRef.current = { start: cursorPos, end: cursorPos };
        el.focus();
        el.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    },
    [input],
  );

  const handleChange = useCallback(
    (val: string, selectionStart: number, selectionEnd: number) => {
      const next = clampInputLength(val);
      setInput(next);
      const normalizedSelectionStart = Math.min(selectionStart, next.length);
      const normalizedSelectionEnd = Math.min(selectionEnd, next.length);
      skillInsertAnchorRef.current = { start: normalizedSelectionStart, end: normalizedSelectionEnd };
      const trigger = detectMenuTrigger(next, normalizedSelectionStart);
      if (trigger?.type === 'mention') {
        setShowMentions(true);
        setShowSkillMenu(false);
        setMentionStart(trigger.start);
        setMentionEnd(normalizedSelectionStart);
        setMentionFilter(trigger.filter);
        setSelectedIdx(0);
      } else {
        closeMenus();
        setMentionStart(-1);
        setMentionEnd(-1);
        setMentionFilter('');
        setSkillFilter('');
      }
    },
    [closeMenus],
  );

  useEffect(() => {
    if (!threadId) return;
    const typedMentionIds = catOptions
      .filter((opt) => {
        const routeToken = opt.insert.trim();
        const displayTokenBase = opt.label.replace(/\s*\([^)]*\)\s*$/, '').trim();
        const displayToken = displayTokenBase.startsWith('@') ? displayTokenBase : `@${displayTokenBase}`;
        const candidates = [routeToken, displayToken].filter((t) => t.startsWith('@'));
        return candidates.some((token) => {
          const re = new RegExp(`(^|\\s)${escapeRegExp(token)}(?=\\s|$)`, 'i');
          return re.test(input);
        });
      })
      .map((opt) => opt.id);
    replaceThreadTargetCats(threadId, typedMentionIds);
  }, [catOptions, input, replaceThreadTargetCats, threadId]);

  const handleHistorySelect = useCallback(
    (text: string) => {
      setInput(text);
      setShowHistorySearch(false);
      ghostRef.current = null;
      setGhostSuggestion(null);
      closeMenus();
      setMentionFilter('');
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [closeMenus],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return;

    // F080: Ctrl+R opens history search (clear any active menus first)
    if (e.ctrlKey && e.key === 'r') {
      e.preventDefault();
      closeMenus();
      setMentionStart(-1);
      setMentionEnd(-1);
      setMentionFilter('');
      setSkillFilter('');
      setShowHistorySearch(true);
      return;
    }

    // Ctrl+Enter inserts newline instead of sending.
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      const ta = textareaRef.current;
      const start = ta?.getSelectionStart() ?? input.length;
      const end = ta?.getSelectionEnd() ?? input.length;
      const next = `${input.slice(0, start)}\n${input.slice(end)}`;
      setInput(next);
      closeMenus();
      pathCompletion.close();
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(start + 1, start + 1);
      }, 0);
      return;
    }

    if (activeMenu) {
      if (activeOptionsCount === 0) {
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab' || e.key === 'Escape') {
          e.preventDefault();
        }
        closeMenus();
        setMentionStart(-1);
        setMentionEnd(-1);
        setMentionFilter('');
        setSkillFilter('');
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % activeOptionsCount);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + activeOptionsCount) % activeOptionsCount);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (activeMenu === 'mention') {
          const opt = filteredCatOptions[selectedIdx];
          if (!opt) {
            closeMenus();
            return;
          }
          insertMention(opt);
        } else if (activeMenu === 'skill') {
          const skill = filteredSkillOptions[selectedIdx];
          if (!skill) {
            closeMenus();
            return;
          }
          insertSkill(skill.name);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenus();
        setMentionStart(-1);
        setMentionEnd(-1);
        return;
      }
    }

    // F080-P2: path completion menu keyboard navigation
    if (pathCompletion.isOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        pathCompletion.setSelectedIdx((pathCompletion.selectedIdx + 1) % pathCompletion.entries.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        pathCompletion.setSelectedIdx(
          (pathCompletion.selectedIdx - 1 + pathCompletion.entries.length) % pathCompletion.entries.length,
        );
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const entry = pathCompletion.entries[pathCompletion.selectedIdx];
        if (entry) {
          const newText = pathCompletion.selectEntry(entry);
          setInput(newText);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        pathCompletion.close();
        return;
      }
    }

    // F080: Tab or ArrowRight accepts ghost suggestion (only when no menu is active)
    // ArrowRight only accepts when cursor is at end of input (no selection)
    if (e.key === 'Tab' || e.key === 'ArrowRight') {
      const ta = textareaRef.current;
      const currentVal = input;
      const selectionStart = ta?.getSelectionStart() ?? currentVal.length;
      const selectionEnd = ta?.getSelectionEnd() ?? currentVal.length;
      const cursorAtEnd = selectionStart === selectionEnd && selectionStart === currentVal.length;
      if (e.key === 'ArrowRight' && !cursorAtEnd) {
        // Let ArrowRight move cursor normally when not at end
      } else {
        const match = useInputHistoryStore.getState().findMatch(currentVal);
        if (match) {
          e.preventDefault();
          setInput(match);
          ghostRef.current = null;
          setGhostSuggestion(null);
          return;
        }
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // F39: Enter while cat running → queue send; normal otherwise
      if (hasActiveInvocation) handleQueueSend();
      else handleSend();
    }
  };

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      const selectedFiles = Array.from(files);

      const supportedFiles: File[] = [];
      let hasUnsupported = false;
      let hasOversized = false;

      for (const file of selectedFiles) {
        if (!isSupportedAttachmentFile(file)) {
          hasUnsupported = true;
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          hasOversized = true;
          continue;
        }
        supportedFiles.push(file);
      }

      if (hasUnsupported) {
        addToast({
          type: 'error',
          title: '上传失败',
          message: UNSUPPORTED_FILE_TYPE_MESSAGE,
          duration: 2600,
        });
      }

      if (hasOversized) {
        addToast({
          type: 'error',
          title: '上传失败',
          message: FILE_SIZE_EXCEEDED_MESSAGE,
          duration: 2600,
        });
      }

      if (supportedFiles.length > 0) {
        const result = mergeFilesByName(imagesRef.current, supportedFiles, MAX_ATTACHMENT_FILES);
        setImages(result.files);
        if (result.dropped > 0) {
          addToast({
            type: 'error',
            title: '附件数量已达上限',
            message: `最多支持选择 ${MAX_ATTACHMENT_FILES} 个附件`,
            duration: 2600,
          });
        }
      }
      e.target.value = '';
    },
    [addToast],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const hasText = Array.from(items).some(
        (item) => item.kind === 'string' && (item.type === 'text/plain' || item.type === 'text/html'),
      );
      if (hasText) return;
      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind !== 'file') continue;
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
      if (pastedFiles.length === 0) return;

      const supportedFiles: File[] = [];
      let hasUnsupported = false;
      let hasOversized = false;

      for (const file of pastedFiles) {
        if (!isSupportedAttachmentFile(file)) {
          hasUnsupported = true;
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          hasOversized = true;
          continue;
        }
        supportedFiles.push(file);
      }

      if (hasUnsupported) {
        addToast({
          type: 'error',
          title: '上传失败',
          message: UNSUPPORTED_FILE_TYPE_MESSAGE,
          duration: 2600,
        });
      }

      if (hasOversized) {
        addToast({
          type: 'error',
          title: '上传失败',
          message: FILE_SIZE_EXCEEDED_MESSAGE,
          duration: 2600,
        });
      }

      if (supportedFiles.length === 0) return;
      e.preventDefault();
      const result = mergeFilesByName(imagesRef.current, supportedFiles, MAX_ATTACHMENT_FILES);
      setImages(result.files);
      if (result.dropped > 0) {
        addToast({
          type: 'error',
          title: '附件数量已达上限',
          message: `最多支持选择 ${MAX_ATTACHMENT_FILES} 个附件`,
          duration: 2600,
        });
      }
    },
    [addToast],
  );

  const handleTextareaScroll = useCallback((_e: React.UIEvent<HTMLDivElement>) => {}, []);

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current?.getElement();
    if (!ta) return;
    const prevScrollTop = ta.scrollTop;
    const prevClientHeight = ta.clientHeight;
    const prevScrollHeight = ta.scrollHeight;
    const wasNearBottom = prevScrollTop + prevClientHeight >= prevScrollHeight - 2;
    ta.style.height = 'auto';
    const contentHeight = ta.scrollHeight;
    const nextHeight = Math.max(TEXTAREA_MIN_HEIGHT, Math.min(contentHeight, TEXTAREA_MAX_HEIGHT));
    const nextOverflowY = contentHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
    const nextHeightCss = `${nextHeight}px`;
    if (ta.style.height !== nextHeightCss) ta.style.height = nextHeightCss;
    if (ta.style.overflowY !== nextOverflowY) ta.style.overflowY = nextOverflowY;
    if (nextOverflowY === 'auto') {
      if (wasNearBottom) ta.scrollTop = ta.scrollHeight;
      else ta.scrollTop = prevScrollTop;
    } else {
      ta.scrollTop = 0;
    }
  }, []);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  useLayoutEffect(() => {
    updateMentionMenuPosition();
  }, [updateMentionMenuPosition, input, mentionFilter, showMentions]);

  useEffect(() => {
    if (!showMentions) return;
    const onWindowChange = () => updateMentionMenuPosition();
    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, true);
    return () => {
      window.removeEventListener('resize', onWindowChange);
      window.removeEventListener('scroll', onWindowChange, true);
    };
  }, [showMentions, updateMentionMenuPosition]);

  const handleRemoveImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const toggleWhisperTarget = useCallback((catId: string) => {
    setWhisperTargets((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }, []);

  // Clamp selectedIdx when catOptions shrink — only when mention menu is active.
  // selectedIdx is shared by mention/game menus; clamping to catOptions.length
  // when game menu is open would corrupt game selection.
  useEffect(() => {
    if (!showMentions) return;
    setSelectedIdx((i) => Math.min(i, Math.max(0, filteredCatOptions.length - 1)));
  }, [filteredCatOptions, showMentions]);

  useEffect(() => {
    if (!showSkillMenu) return;
    setSelectedIdx((i) => Math.min(i, Math.max(0, filteredSkillOptions.length - 1)));
  }, [filteredSkillOptions, showSkillMenu]);

  useEffect(() => {
    if (!showSkillMenu) return;
    const el = skillOptionRefs.current[selectedIdx];
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx, showSkillMenu]);

  // Reconcile whisperTargets: remove invalid ids + remove newly-active cats (B10)
  useEffect(() => {
    if (!whisperMode) return;
    const validIds = new Set(whisperOptions.map((c) => c.id));
    setWhisperTargets((prev) => {
      const filtered = new Set([...prev].filter((id) => validIds.has(id) && !activeCatIds.has(id)));
      return filtered.size === prev.size ? prev : filtered;
    });
  }, [whisperOptions, whisperMode, activeCatIds]);

  const handleSkillClick = useCallback(() => {
    const ta = textareaRef.current;
    const start = ta?.getSelectionStart() ?? input.length;
    const end = ta?.getSelectionEnd() ?? input.length;
    skillInsertAnchorRef.current = { start, end };
    setShowMentions(false);
    setShowSkillMenu((prev) => !prev);
    setSelectedIdx(0);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [input]);

  const handleWhisperToggle = useCallback(() => {
    setWhisperMode((prev) => {
      if (!prev) {
        // Entering whisper mode — auto-select idle cats only (B10: executing cats excluded)
        setWhisperTargets(new Set(whisperOptions.filter((c) => !activeCatIds.has(c.id)).map((c) => c.id)));
      }
      return !prev;
    });
  }, [whisperOptions, activeCatIds]);

  // Sync input text to module-level draft map (covers all sources: typing, voice, mentions)
  // useLayoutEffect runs synchronously before browser paint and before unmount,
  // ensuring the draft is written to the Map before the component is destroyed
  // on thread switch (key={threadId}). useEffect would lose the final keystroke.
  useLayoutEffect(() => {
    if (!threadId) return;
    if (input) threadDrafts.set(threadId, input);
    else threadDrafts.delete(threadId);
  }, [input, threadId]);

  // F080: recalculate ghost suggestion whenever input changes (covers all setInput paths)
  useEffect(() => {
    const match = input.trim() ? findHistoryMatch(input) : null;
    ghostRef.current = match;
    setGhostSuggestion(match);
  }, [input, findHistoryMatch]);

  useEffect(() => {
    if (!activeMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      // React 18 may flush state synchronously during event bubbling,
      // detaching the original target (e.g. layer 1 unmounts when drilling
      // into layer 2). A detached target is not a genuine outside click.
      if (!target.isConnected) return;
      if (menuRef.current && !menuRef.current.contains(target) && !skillBtnRef.current?.contains(target)) {
        closeMenus();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeMenu, closeMenus]);

  return (
    <div className="relative safe-area-bottom bg-transparent">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-1/2 z-0 h-[100px] -translate-x-1/2 opacity-[0.25] blur-[50px]"
        style={{
          borderRadius: '490px',
          width: 'calc(80% - 80px)',
          background: 'var(--chat-input-accent-glow)',
        }}
      ></div>
      {/* F39: Queue status bar — visible when cat is running */}
      {hasActiveInvocation && (
        <div className="px-4 pt-2 hidden items-center gap-2 mx-auto w-[80%]">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--chat-input-queue-accent)] animate-pulse" />
          <span className="text-xs font-medium text-[var(--chat-input-queue-accent)]">正在回复中...</span>
          <span className="hidden text-xs text-[var(--text-label-secondary)]">继续输入，消息会排队</span>
        </div>
      )}

      {pathCompletion.isOpen && !activeMenu && (
        <PathCompletionMenu
          entries={pathCompletion.entries}
          selectedIdx={pathCompletion.selectedIdx}
          onSelectIdx={pathCompletion.setSelectedIdx}
          onSelect={(entry) => {
            const newText = pathCompletion.selectEntry(entry);
            setInput(newText);
            setTimeout(() => textareaRef.current?.focus(), 0);
          }}
        />
      )}

      <ChatInputMenus
        catOptions={filteredCatOptions}
        showMentions={showMentions}
        mentionFilter={mentionFilter}
        onMentionFilterChange={(value) => {
          setMentionFilter(value);
          setSelectedIdx(0);
        }}
        onCloseMentionMenu={() => {
          closeMenus();
          setMentionStart(-1);
          setMentionEnd(-1);
          setMentionFilter('');
        }}
        selectedIdx={selectedIdx}
        onSelectIdx={setSelectedIdx}
        onInsertMention={insertMention}
        menuRef={menuRef}
        mentionMenuStyle={mentionMenuStyle}
      />

      {imageLifecycleStatus === 'preparing' && (
        <div className="mx-auto w-[80%] px-4 pt-2 text-xs text-[var(--text-muted)]" role="status">
          文件处理中，完成后可发送
        </div>
      )}
      {imageLifecycleStatus === 'uploading' && (
        <div className="mx-auto w-[80%] px-4 pt-2 text-xs text-[var(--state-info-text)]" role="status">
          文件上传中，请稍候...
        </div>
      )}
      {imageLifecycleStatus === 'failed' && uploadError && (
        <div className="mx-auto w-[80%] px-4 pt-2 text-xs text-[var(--state-error-text)]" role="alert">
          文件发送失败：{uploadError}
        </div>
      )}

      {whisperMode && (
        <div className="px-4 pt-2 flex items-center gap-2 flex-wrap mx-auto w-[80%]">
          <span className="text-xs font-medium text-[var(--state-warning-text)]">悄悄话发给:</span>
          {whisperOptions.map((cat) => {
            const isActive = activeCatIds.has(cat.id);
            const isSelected = whisperTargets.has(cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => !isActive && toggleWhisperTarget(cat.id)}
                disabled={isActive}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  isActive
                    ? 'cursor-not-allowed border-[var(--button-disabled-border)] bg-[var(--button-disabled-bg)] text-[var(--button-disabled-text)]'
                    : isSelected
                      ? 'border-current bg-[var(--state-warning-surface)] font-medium'
                      : 'border-[var(--border-default)] text-[var(--text-label-secondary)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)]'
                }`}
                style={!isActive && isSelected ? { color: cat.color } : undefined}
                title={isActive ? `${cat.label.replace('@', '')} 执行中，不可选` : undefined}
              >
                {cat.label.replace('@', '')}
                {isActive && ' ⏳'}
              </button>
            );
          })}
          {whisperTargets.size === 0 && (
            <span className="text-xs text-[var(--state-error-text)]">请至少选一个智能体</span>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Mobile expanded toolbar (above input row) */}
      {mobileToolbar && (
        <MobileInputToolbar
          onAttach={() => fileInputRef.current?.click()}
          onWhisperToggle={handleWhisperToggle}
          onGameClick={() => {}}
          onClose={() => setMobileToolbar(false)}
          disabled={disabled}
          sendDisabled={sendTemporarilyDisabled}
          maxImages={images.length >= MAX_ATTACHMENT_FILES}
          whisperMode={whisperMode}
        />
      )}

      <div className="relative z-10 px-4 pt-2 mx-auto w-[80%]">
        <div className="flex gap-2 items-end">
          {/* Mobile: + toggle button */}
          { false && <button
            onClick={() => setMobileToolbar((v) => !v)}
            className={`p-3 rounded-xl transition-all md:hidden ${
              mobileToolbar
                ? 'rotate-45 bg-[var(--accent-soft)] text-[var(--text-accent)]'
                : 'text-[var(--text-label-secondary)] hover:bg-[var(--surface-panel)] hover:text-[var(--text-accent)]'
            }`}
            aria-label="展开工具栏"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
          </button> }

          <div className="flex-1">
            <div>
              {!showQuickPrompts && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {visibleQuickActions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => handleQuickAction(action)}
                      disabled={disabled}
                      className={QUICK_ACTION_BUTTON_CLASS}
                    >
                      <img src={action.icon} alt="" aria-hidden="true" className="h-4 w-4 shrink-0" />
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {showQuickPrompts && selectedQuickAction && (
                <div
                  className="mb-2 grid gap-2"
                  style={{
                    gridTemplateColumns: selectedQuickAction.expertCards
                      ? 'repeat(3, minmax(0, 1fr))'
                      : `repeat(${selectedQuickAction.prompts.length}, minmax(0, 1fr))`,
                  }}
                >
                  {selectedQuickAction.expertCards
                    ? // 专家团思辨卡片渲染
                    selectedQuickAction.expertCards.map((card) => (
                      <button
                        key={card.agentId}
                        type="button"
                        onClick={() => handleExpertCardClick(card.agentName, card.content)}
                        className={EXPERT_CARD_BUTTON_CLASS}
                      >
                        <p className="line-clamp-4 text-[13px] leading-[20px] text-[var(--text-secondary)]">
                          <span className="font-medium text-[var(--text-accent)]">@{card.agentName}</span>，{card.content}
                        </p>
                      </button>
                    ))
                    : // 普通快捷提示卡片渲染
                    selectedQuickAction.prompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => handleQuickPrompt(prompt)}
                        className={QUICK_PROMPT_BUTTON_CLASS}
                      >
                        {prompt}
                      </button>
                    ))}
                </div>
              )}

              <div className="relative">
                <div
                  className={`relative min-h-[114px] overflow-visible rounded-[24px] border transition-colors ${
                    whisperMode
                      ? 'border-[var(--chat-input-whisper-border)] bg-[var(--chat-input-whisper-bg)] focus-within:border-[var(--chat-input-whisper-focus-border)]'
                      : 'chat-input-shell bg-[var(--surface-panel)]'
                  } w-full min-w-0`}
                >
                  <ImagePreview files={images} onRemove={handleRemoveImage} />
                  <div className="relative overflow-hidden rounded-t-[24px]">
                    <RichTextarea
                      ref={textareaRef}
                      value={input}
                      onValueChange={handleChange}
                      onCompositionStateChange={setIsComposing}
                      maxLength={MAX_INPUT_LENGTH}
                      onInput={resizeTextarea}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      onScroll={handleTextareaScroll}
                      placeholder={
                        hasActiveInvocation ? '描述你想研究的主题或@助手协助工作' : '描述你想研究的主题或@助手协助工作'
                      }
                      className="chat-input-textarea block min-h-[70px] w-full bg-transparent px-[18px] py-4 text-[16px] leading-[24px] text-[var(--text-primary)] whitespace-pre-wrap break-words [overflow-wrap:anywhere] placeholder:text-[var(--text-field-placeholder)] focus:outline-none"
                      disabled={disabled}
                      skillOptions={skillOptions}
                      quickActionOptions={visibleQuickActions.map((action) => ({
                        label: action.label,
                        icon: action.icon,
                        token: getQuickActionToken(action.label),
                      }))}
                    />
                    {ghostSuggestion &&
                      !isComposing &&
                      !pathCompletion.isOpen &&
                      !showMentions &&
                      !/(^|\s)@/.test(input) && (
                        <div
                          data-testid="ghost-suggestion"
                          className="pointer-events-none absolute inset-0 w-full overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-t-[24px] p-4 text-[16px]"
                          aria-hidden="true"
                        >
                          <span className="invisible">{input}</span>
                          <span className="text-[var(--text-field-placeholder)]">{ghostSuggestion.slice(input.length)}</span>
                        </div>
                      )}
                  </div>
                  <div className="px-[10px] pb-[10px]">
                    <div className="flex items-center justify-between gap-2">
                      <div className="relative">
                        <button
                          ref={skillBtnRef}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const ta = textareaRef.current;
                            const start = ta?.getSelectionStart() ?? input.length;
                            const end = ta?.getSelectionEnd() ?? input.length;
                            skillInsertAnchorRef.current = { start, end };
                          }}
                          onClick={handleSkillClick}
                          className={SKILL_TRIGGER_BUTTON_CLASS}
                        >
                          <img src="/icons/menu/skills.svg" alt="" aria-hidden="true" className="h-4 w-4 shrink-0" />
                          技能
                        </button>
                        {showSkillMenu && (
                          <div
                            ref={menuRef}
                            className={SKILL_MENU_CLASS}
                          >
                            <div className="px-1 pt-0 pb-2">
                              <div className="relative">
                                <svg
                                  className="pointer-events-none absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-label-secondary)]"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <circle cx="11" cy="11" r="7" />
                                  <path d="M20 20l-3.5-3.5" />
                                </svg>
                                <input
                                  value={skillFilter}
                                  onChange={(e) => {
                                    setSkillFilter(e.target.value);
                                    setSelectedIdx(0);
                                  }}
                                  onKeyDown={(e) => {
                                    if (filteredSkillOptions.length === 0) {
                                      if (e.key === 'Escape') {
                                        e.preventDefault();
                                        closeMenus();
                                      }
                                      return;
                                    }
                                    if (e.key === 'ArrowDown') {
                                      e.preventDefault();
                                      setSelectedIdx((idx) => (idx + 1) % filteredSkillOptions.length);
                                      return;
                                    }
                                    if (e.key === 'ArrowUp') {
                                      e.preventDefault();
                                      setSelectedIdx(
                                        (idx) => (idx - 1 + filteredSkillOptions.length) % filteredSkillOptions.length,
                                      );
                                      return;
                                    }
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      const skill = filteredSkillOptions[selectedIdx];
                                      if (skill) insertSkill(skill.name);
                                      return;
                                    }
                                    if (e.key === 'Escape') {
                                      e.preventDefault();
                                      closeMenus();
                                    }
                                  }}
                                  placeholder="请输入关键字搜索"
                                  className="ui-input ui-input-underline w-full py-1 pl-6 pr-0 text-sm"
                                />
                              </div>
                            </div>
                            <div className="-mr-1 max-h-[260px] overflow-y-auto pr-1 [scrollbar-gutter:auto]">
                              {skillOptionsLoading &&
                                Array.from({ length: 5 }).map((_, i) => (
                                  <div
                                    key={`skill-loading-${i}`}
                                    className="flex h-[24px] w-full items-center gap-2 rounded-[6px] p-2"
                                    style={{ animationDelay: `${i * 70}ms` }}
                                  >
                                    <div className="h-4 w-4 shrink-0 rounded-sm bg-[var(--surface-card-muted)] animate-pulse" />
                                    <div className="h-3 w-[120px] rounded bg-[var(--surface-card-muted)] animate-pulse" />
                                  </div>
                                ))}
                              {!skillOptionsLoading &&
                                filteredSkillOptions.map((skill, i) => (
                                  <button
                                    key={skill.name}
                                    type="button"
                                    ref={(node) => {
                                      skillOptionRefs.current[i] = node;
                                    }}
                                    className={`${SKILL_MENU_ITEM_CLASS} ${
                                      i === selectedIdx
                                        ? 'bg-[var(--overlay-item-hover-bg)]'
                                        : 'hover:bg-[var(--overlay-item-hover-bg)]'
                                    }`}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      insertSkill(skill.name);
                                    }}
                                  >
                                    <SkillOptionIcon name={skill.name} iconUrl={skill.iconUrl} />
                                    <span className="truncate">{skill.name}</span>
                                  </button>
                                ))}
                              {!skillOptionsLoading && filteredSkillOptions.length === 0 && (
                                <div className="px-2 py-2 text-xs text-[var(--text-label-secondary)]">无匹配技能</div>
                              )}
                            </div>
                            <div className="p-2">
                              <div className="h-px w-full bg-[var(--panel-divider)]" />
                            </div>
                            <button
                              type="button"
                              className="ui-button-default mx-2 inline-flex h-[24px] min-w-0 items-center justify-center px-3 text-[12px]"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                closeMenus();
                                window.dispatchEvent(
                                  new CustomEvent('cat-cafe:open-sidebar-menu', { detail: { menu: 'skills' } }),
                                );
                              }}
                            >
                              管理技能
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center">
                        <OverflowTooltip
                          content={selectedFolderTitle?.trim() || folderButtonLabel}
                          forceShow={shouldShowFolderTooltip}
                          copyable={shouldShowFolderTooltip}
                          className="mr-2 flex items-center"
                        >
                          <button
                            type="button"
                            data-testid="folder-select-button"
                            onClick={onOpenFolderPicker}
                            disabled={isFolderButtonDisabled}
                            className="ui-button-default inline-flex h-8 min-w-0 max-w-[160px] items-center gap-1 rounded-[16px] px-3 text-xs shadow-none"
                          >
                            <FolderBadgeIcon className="h-6 w-6 shrink-0" />
                            <span className="truncate">{folderButtonLabel}</span>
                          </button>
                        </OverflowTooltip>
                        <OverflowTooltip content="选择附件" forceShow className="inline-flex">
                          <button
                            type="button"
                            data-testid="attach-file-button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={disabled || sendTemporarilyDisabled || images.length >= MAX_ATTACHMENT_FILES}
                            className={ICON_BUTTON_CLASS}
                            aria-label="上传附件"
                          >
                            <AttachIcon className="h-5 w-5" />
                          </button>
                        </OverflowTooltip>
                        <ChatInputActionButton
                          onTranscript={handleTranscript}
                          onSend={handleSend}
                          onStop={onStop}
                          onQueueSend={handleQueueSend}
                          onForceSend={handleForceSend}
                          disabled={disabled}
                          sendDisabled={sendTemporarilyDisabled}
                          hasActiveInvocation={hasActiveInvocation}
                          hasText={!!input.trim()}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <p className="mt-2 mb-4 text-center text-[12px] font-normal leading-[20px] text-[var(--text-disabled)]">
                  内容由AI生成，仅供参考
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showHistorySearch && (
        <HistorySearchModal onSelect={handleHistorySelect} onClose={() => setShowHistorySearch(false)} />
      )}
    </div>
  );
}
