/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import {
  forwardRef,
  type CSSProperties,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
  type UIEvent,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getMentionToCat } from '@/lib/mention-highlight';

export interface RichSkillOption {
  name: string;
  iconUrl?: string | null;
}

export interface RichQuickActionOption {
  label: string;
  icon?: string;
  token?: string;
}

interface RichTextareaProps {
  value: string;
  onValueChange: (value: string, selectionStart: number, selectionEnd: number) => void;
  onInput?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  onPaste?: (e: ClipboardEvent<HTMLDivElement>) => void;
  onScroll?: (e: UIEvent<HTMLDivElement>) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  maxLength?: number;
  skillOptions?: RichSkillOption[];
  quickActionOptions?: RichQuickActionOption[];
}

export interface RichTextareaHandle {
  focus: () => void;
  getSelectionStart: () => number;
  getSelectionEnd: () => number;
  setSelectionRange: (start: number, end: number) => void;
  getElement: () => HTMLDivElement | null;
  getClientRectAtOffset: (offset: number) => DOMRect | null;
}

type Segment =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string }
  | { type: 'skill'; text: string; iconUrl?: string | null }
  | { type: 'quick_action'; text: string; icon?: string; token: string };

const MENTION_RIGHT_WHITESPACE_RE = /\s/;
const QUICK_ACTION_TOKEN_PREFIX = '[[quick_action:';
const QUICK_ACTION_TOKEN_SUFFIX = ']]';

function buildSegments(value: string, skillOptions: RichSkillOption[], quickActionOptions: RichQuickActionOption[]): Segment[] {
  if (!value) return [{ type: 'text', text: '' }];
  const sortedSkills = [...skillOptions].sort((a, b) => b.name.length - a.name.length);
  const quickActionIconByLabel = new Map(quickActionOptions.map((item) => [item.label, item.icon]));
  const mentionToCat = getMentionToCat();
  const mentionAliases = Object.keys(mentionToCat).sort((a, b) => b.length - a.length);
  const segments: Segment[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    if (value.startsWith(QUICK_ACTION_TOKEN_PREFIX, cursor)) {
      const end = value.indexOf(QUICK_ACTION_TOKEN_SUFFIX, cursor + QUICK_ACTION_TOKEN_PREFIX.length);
      if (end > cursor) {
        const token = value.slice(cursor, end + QUICK_ACTION_TOKEN_SUFFIX.length);
        const label = value.slice(cursor + QUICK_ACTION_TOKEN_PREFIX.length, end);
        segments.push({
          type: 'quick_action',
          text: label,
          icon: quickActionIconByLabel.get(label),
          token,
        });
        cursor = end + QUICK_ACTION_TOKEN_SUFFIX.length;
        continue;
      }
    }

    let matchedSkill: RichSkillOption | null = null;
    for (const skill of sortedSkills) {
      const name = skill.name;
      if (!name) continue;
      if (!value.startsWith(name, cursor)) continue;
      const prev = cursor > 0 ? value[cursor - 1] : ' ';
      const next = cursor + name.length < value.length ? value[cursor + name.length] : ' ';
      if (/\s/.test(prev) && /\s/.test(next)) {
        matchedSkill = skill;
        break;
      }
    }
    if (matchedSkill) {
      segments.push({ type: 'skill', text: matchedSkill.name, iconUrl: matchedSkill.iconUrl });
      cursor += matchedSkill.name.length;
      continue;
    }

    const prev = cursor > 0 ? value[cursor - 1] : ' ';
    if (value[cursor] === '@' && /\s/.test(prev)) {
      let matched: { text: string; len: number } | null = null;
      for (const alias of mentionAliases) {
        if (!alias) continue;
        const token = `@${alias}`;
        const raw = value.slice(cursor, cursor + token.length);
        if (raw.toLowerCase() !== token.toLowerCase()) continue;
        const next = value[cursor + token.length];
        // Mention must be followed by an actual whitespace char.
        // End-of-text does NOT count, so deleting trailing space de-highlights immediately.
        if (!next || !MENTION_RIGHT_WHITESPACE_RE.test(next)) continue;
        matched = { text: raw, len: token.length };
        break;
      }
      if (matched) {
        segments.push({ type: 'mention', text: matched.text });
        cursor += matched.len;
        continue;
      }
    }

    segments.push({ type: 'text', text: value[cursor] ?? '' });
    cursor += 1;
  }
  return segments;
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\u00A0/g, ' ');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  if (el.dataset.tokenType === 'skill' || el.dataset.tokenType === 'quick-action') return el.dataset.tokenValue ?? '';
  let out = '';
  for (const child of Array.from(el.childNodes)) out += serializeNode(child);
  return out;
}

function serializeNodeSignature(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return `t:${(node.textContent ?? '').replace(/\u00A0/g, ' ')}`;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  if (el.dataset.tokenType === 'skill') return `s:${el.dataset.tokenValue ?? ''}`;
  if (el.dataset.tokenType === 'quick-action') return `q:${el.dataset.tokenValue ?? ''}`;
  if (el.dataset.tokenType === 'mention') return `m:${el.textContent ?? ''}`;
  let out = '';
  for (const child of Array.from(el.childNodes)) out += serializeNodeSignature(child);
  return out;
}

function collectTextNodes(root: HTMLElement): Array<{ node: Node; start: number; end: number }> {
  const out: Array<{ node: Node; start: number; end: number }> = [];
  let offset = 0;
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      out.push({ node, start: offset, end: offset + text.length });
      offset += text.length;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.dataset.tokenType === 'skill' || el.dataset.tokenType === 'quick-action') {
      const token = el.dataset.tokenValue ?? '';
      out.push({ node: el, start: offset, end: offset + token.length });
      offset += token.length;
      return;
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  walk(root);
  return out;
}

function getSelectionOffset(root: HTMLElement, atEnd: boolean): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const active = sel.getRangeAt(0);
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(atEnd ? active.endContainer : active.startContainer, atEnd ? active.endOffset : active.startOffset);
  const fragment = range.cloneContents();
  let serialized = '';
  for (const child of Array.from(fragment.childNodes)) {
    serialized += serializeNode(child);
  }
  return serialized.length;
}

function setSelectionOffset(root: HTMLElement, start: number, end: number): void {
  const nodes = collectTextNodes(root);
  const pick = (offset: number): { node: Node; offset: number } => {
    for (const item of nodes) {
      if (offset <= item.end) {
        if (item.node.nodeType === Node.TEXT_NODE) {
          return { node: item.node, offset: Math.max(0, Math.min((item.node.textContent ?? '').length, offset - item.start)) };
        }
        const parent = item.node.parentNode;
        if (parent) {
          const idx = Array.prototype.indexOf.call(parent.childNodes, item.node);
          if (offset - item.start <= 0) return { node: parent, offset: idx };
          return { node: parent, offset: idx + 1 };
        }
      }
    }
    return { node: root, offset: root.childNodes.length };
  };

  const s = pick(start);
  const e = pick(end);
  const range = document.createRange();
  range.setStart(s.node, s.offset);
  range.setEnd(e.node, e.offset);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

function clampWithSelection(
  nextValue: string,
  selectionStart: number,
  selectionEnd: number,
  maxLength?: number,
): { value: string; start: number; end: number } {
  if (!maxLength || maxLength <= 0 || nextValue.length <= maxLength) {
    return { value: nextValue, start: selectionStart, end: selectionEnd };
  }
  const clampedValue = nextValue.slice(0, maxLength);
  return {
    value: clampedValue,
    start: Math.min(selectionStart, clampedValue.length),
    end: Math.min(selectionEnd, clampedValue.length),
  };
}

function forceSyncPlainText(root: HTMLElement, value: string, start: number, end: number): void {
  root.replaceChildren(document.createTextNode(value));
  setSelectionOffset(root, start, end);
}

function resolvePositionAtOffset(root: HTMLElement, offset: number): { node: Node; offset: number } {
  const nodes = collectTextNodes(root);
  for (const item of nodes) {
    if (offset <= item.end) {
      if (item.node.nodeType === Node.TEXT_NODE) {
        const textLength = (item.node.textContent ?? '').length;
        return { node: item.node, offset: Math.max(0, Math.min(textLength, offset - item.start)) };
      }
      const parent = item.node.parentNode;
      if (parent) {
        const idx = Array.prototype.indexOf.call(parent.childNodes, item.node);
        if (offset - item.start <= 0) return { node: parent, offset: idx };
        return { node: parent, offset: idx + 1 };
      }
    }
  }
  return { node: root, offset: root.childNodes.length };
}

function getClientRectAtOffset(root: HTMLElement, offset: number): DOMRect | null {
  try {
    const pos = resolvePositionAtOffset(root, offset);
    const range = document.createRange();
    range.setStart(pos.node, pos.offset);
    range.setEnd(pos.node, pos.offset);
    const rect = range.getBoundingClientRect();
    if (rect.width !== 0 || rect.height !== 0) return rect;
    const fallback = root.getBoundingClientRect();
    return fallback.width > 0 || fallback.height > 0 ? fallback : null;
  } catch {
    return null;
  }
}

function isTextInsertionKey(e: KeyboardEvent<HTMLDivElement>): boolean {
  if (e.key.length === 1) return true;
  return e.key === 'Enter';
}

export const RichTextarea = forwardRef<RichTextareaHandle, RichTextareaProps>(function RichTextarea(
  {
    value,
    onValueChange,
    onInput,
    onKeyDown,
    onPaste,
    onScroll,
    placeholder,
    className,
    style,
    disabled,
    maxLength,
    skillOptions = [],
    quickActionOptions = [],
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isComposingRef = useRef(false);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const shouldScrollToBottomRef = useRef(false);
  const [showPlaceholder, setShowPlaceholder] = useState(() => !value);
  const segments = useMemo(() => buildSegments(value, skillOptions, quickActionOptions), [value, skillOptions, quickActionOptions]);
  const segmentSignature = useMemo(
    () =>
      segments
        .map((seg) => {
          if (seg.type === 'text') return `t:${seg.text}`;
          if (seg.type === 'mention') return `m:${seg.text}`;
          if (seg.type === 'quick_action') return `q:${seg.token}`;
          return `s:${seg.text}`;
        })
        .join(''),
    [segments],
  );

  useImperativeHandle(ref, () => ({
    focus: () => rootRef.current?.focus(),
    getSelectionStart: () => {
      const root = rootRef.current;
      if (!root) return 0;
      return getSelectionOffset(root, false);
    },
    getSelectionEnd: () => {
      const root = rootRef.current;
      if (!root) return 0;
      return getSelectionOffset(root, true);
    },
    setSelectionRange: (start: number, end: number) => {
      const root = rootRef.current;
      if (!root) return;
      setSelectionOffset(root, start, end);
    },
    getElement: () => rootRef.current,
    getClientRectAtOffset: (offset: number) => {
      const root = rootRef.current;
      if (!root) return null;
      return getClientRectAtOffset(root, offset);
    },
  }));

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // IME composition guard: rebuilding DOM during 拼音组合输入会打断候选词。
    if (isComposingRef.current) return;
    const current = Array.from(root.childNodes).map((n) => serializeNode(n)).join('');
    const currentSignature = Array.from(root.childNodes).map((n) => serializeNodeSignature(n)).join('');
    if (current === value && currentSignature === segmentSignature) return;

    const active = document.activeElement === root;
    const pendingSelection = active ? pendingSelectionRef.current : null;
    const start = active ? (pendingSelection?.start ?? getSelectionOffset(root, false)) : 0;
    const end = active ? (pendingSelection?.end ?? getSelectionOffset(root, true)) : 0;
    if (pendingSelection) pendingSelectionRef.current = null;
    const prevScrollTop = root.scrollTop;
    const prevClientHeight = root.clientHeight;
    const prevScrollHeight = root.scrollHeight;
    const wasNearBottom = prevScrollTop + prevClientHeight >= prevScrollHeight - 2;

    const frag = document.createDocumentFragment();
    for (const seg of segments) {
      if (seg.type === 'text') {
        frag.appendChild(document.createTextNode(seg.text));
        continue;
      }
      if (seg.type === 'mention') {
        const span = document.createElement('span');
        span.setAttribute('data-token-type', 'mention');
        span.className = 'text-[rgba(20,118,255,1)]';
        span.textContent = seg.text;
        frag.appendChild(span);
        continue;
      }
      if (seg.type === 'quick_action') {
        const token = document.createElement('span');
        token.setAttribute('data-token-type', 'quick-action');
        token.setAttribute('data-token-value', seg.token);
        token.setAttribute('contenteditable', 'false');
        token.className =
          'group/quick-action inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full border text-[14px] font-normal leading-[22px] text-[#191919] align-middle';
        token.style.padding = '3px 8px';
        token.style.borderColor = 'rgba(20,118,255,0.8)';
        token.style.backgroundColor = '#eff6ff';
        token.style.cursor = 'pointer';

        if (seg.icon) {
          const icon = document.createElement('img');
          icon.setAttribute('src', seg.icon);
          icon.setAttribute('alt', '');
          icon.setAttribute('aria-hidden', 'true');
          icon.className = 'h-4 w-4 shrink-0 group-hover/quick-action:hidden';
          token.appendChild(icon);
        } else {
          const fallback = document.createElement('span');
          fallback.setAttribute('aria-hidden', 'true');
          fallback.className = 'h-2 w-2 rounded-full bg-[rgba(20,118,255,1)] group-hover/quick-action:hidden';
          token.appendChild(fallback);
        }

        const remove = document.createElement('span');
        remove.setAttribute('data-remove-quick-action', '1');
        remove.setAttribute('aria-hidden', 'true');
        remove.className =
          'hidden h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#a7a7a7] group-hover/quick-action:inline-flex hover:text-[#1476ff]';
        remove.style.fontSize = '18px';
        remove.style.lineHeight = '18px';
        remove.textContent = '×';
        token.appendChild(remove);

        const label = document.createElement('span');
        label.textContent = seg.text;
        token.appendChild(label);
        frag.appendChild(token);
        continue;
      }
      const token = document.createElement('span');
      token.setAttribute('data-token-type', 'skill');
      token.setAttribute('data-token-value', seg.text);
      token.setAttribute('contenteditable', 'false');
      token.className =
        'inline-flex max-w-full translate-y-[-1px] items-center gap-1 text-[rgba(20,118,255,1)] text-[16px] leading-5 align-middle';

      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.className = 'inline-block h-4 w-4 shrink-0';
      icon.style.backgroundColor = 'currentColor';
      icon.style.maskImage = "url('/icons/menu/skills.svg')";
      icon.style.maskRepeat = 'no-repeat';
      icon.style.maskPosition = 'center';
      icon.style.maskSize = 'contain';
      icon.style.webkitMaskImage = "url('/icons/menu/skills.svg')";
      icon.style.webkitMaskRepeat = 'no-repeat';
      icon.style.webkitMaskPosition = 'center';
      icon.style.webkitMaskSize = 'contain';
      token.appendChild(icon);

      const label = document.createElement('span');
      label.className = 'truncate';
      label.textContent = seg.text;
      token.appendChild(label);
      frag.appendChild(token);
    }

    root.replaceChildren(frag);
    if (active) {
      const nextStart = Math.min(start, value.length);
      const nextEnd = Math.min(end, value.length);
      setSelectionOffset(root, nextStart, nextEnd);
      if (shouldScrollToBottomRef.current) {
        shouldScrollToBottomRef.current = false;
        root.scrollTop = root.scrollHeight;
      } else if (wasNearBottom) {
        // Keep caret visible while typing at the bottom of long content.
        root.scrollTop = root.scrollHeight;
      } else {
        // Preserve manual scroll position when user is editing/viewing middle content.
        root.scrollTop = prevScrollTop;
      }
    }
  }, [segments, segmentSignature, value]);

  useEffect(() => {
    if (isComposingRef.current) return;
    setShowPlaceholder(!value);
  }, [value]);

  const resolveEventElement = (target: EventTarget | null): HTMLElement | null => {
    if (!target) return null;
    if (target instanceof HTMLElement) return target;
    if (target instanceof Text) return target.parentElement;
    return null;
  };

  return (
    <div className="relative">
      {showPlaceholder && placeholder && (
        <div className="pointer-events-none absolute left-4 top-4 text-[16px] text-gray-400">{placeholder}</div>
      )}
      <div
        ref={rootRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        className={className}
        style={style}
        role="textbox"
        aria-multiline="true"
        onMouseDown={(e: MouseEvent<HTMLDivElement>) => {
          const target = resolveEventElement(e.target);
          const removeButton = target?.closest('[data-remove-quick-action="1"]') as HTMLElement | null;
          if (!removeButton) return;

          const token = removeButton.closest('[data-token-type="quick-action"]') as HTMLElement | null;
          const tokenValue = token?.dataset.tokenValue ?? '';
          if (!tokenValue) return;

          e.preventDefault();
          const index = value.indexOf(tokenValue);
          if (index < 0) return;
          const rawNext = `${value.slice(0, index)}${value.slice(index + tokenValue.length)}`;
          const next = rawNext.replace(/\s{2,}/g, ' ').trimStart();
          const caret = Math.min(index, next.length);
          pendingSelectionRef.current = { start: caret, end: caret };
          onValueChange(next, caret, caret);
          onInput?.();
        }}
        onMouseDownCapture={(e: MouseEvent<HTMLDivElement>) => {
          const target = resolveEventElement(e.target);
          if (!target) return;
          const skillToken = target.closest('[data-token-type="skill"]');
          if (!skillToken) return;
          // Keep caret stable when clicking highlighted skill token.
          e.preventDefault();
        }}
        onInput={(e) => {
          const root = rootRef.current;
          if (!root) return;
          if (isComposingRef.current) {
            // Avoid controlled writes during IME composition; commit on compositionend.
            onInput?.();
            return;
          }
          const rawNext = Array.from(root.childNodes).map((n) => serializeNode(n)).join('');
          const rawStart = getSelectionOffset(root, false);
          const rawEnd = getSelectionOffset(root, true);
          const nextState = clampWithSelection(rawNext, rawStart, rawEnd, maxLength);
          pendingSelectionRef.current = { start: nextState.start, end: nextState.end };
          if (nextState.value !== rawNext) {
            // Keep DOM immediately in sync when parent state doesn't change
            // (e.g. already at max length and user keeps typing).
            forceSyncPlainText(e.currentTarget, nextState.value, nextState.start, nextState.end);
          }
          onValueChange(nextState.value, nextState.start, nextState.end);
          onInput?.();
        }}
        onBeforeInput={(e) => {
          const root = rootRef.current;
          if (!root || !maxLength || maxLength <= 0) return;
          const native = e.nativeEvent as InputEvent;
          const inputType = native.inputType ?? '';
          // Let IME composition flow complete naturally; enforce max in onCompositionEnd/onInput.
          if (isComposingRef.current || inputType.includes('Composition')) return;
          if (!inputType.startsWith('insert')) return;
          const current = Array.from(root.childNodes).map((n) => serializeNode(n)).join('');
          const start = getSelectionOffset(root, false);
          const end = getSelectionOffset(root, true);
          const selectedLength = Math.max(0, end - start);
          // For insertParagraph/insertLineBreak, data may be null; treat it as one-char insertion.
          const insertedLength = native.data != null ? native.data.length : 1;
          const nextLength = current.length - selectedLength + insertedLength;
          if (nextLength > maxLength) {
            e.preventDefault();
          }
        }}
        onCompositionStart={() => {
          isComposingRef.current = true;
          setShowPlaceholder(false);
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          const root = rootRef.current;
          if (!root) return;
          const rawNext = Array.from(root.childNodes).map((n) => serializeNode(n)).join('');
          const rawStart = getSelectionOffset(root, false);
          const rawEnd = getSelectionOffset(root, true);
          const nextState = clampWithSelection(rawNext, rawStart, rawEnd, maxLength);
          pendingSelectionRef.current = { start: nextState.start, end: nextState.end };
          if (nextState.value !== rawNext) {
            forceSyncPlainText(root, nextState.value, nextState.start, nextState.end);
          }
          setShowPlaceholder(nextState.value.length === 0);
          onValueChange(nextState.value, nextState.start, nextState.end);
          onInput?.();
        }}
        onKeyDown={(e) => {
          const root = rootRef.current;
          if (root && maxLength && maxLength > 0 && !isComposingRef.current) {
            // Fallback guard: some browsers/IME flows may skip reliable beforeinput checks.
            // When already at max and no active selection, block text-inserting keys directly.
            const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
            if (!hasModifier && isTextInsertionKey(e)) {
              const current = Array.from(root.childNodes)
                .map((n) => serializeNode(n))
                .join('');
              const start = getSelectionOffset(root, false);
              const end = getSelectionOffset(root, true);
              const hasSelection = end > start;
              if (!hasSelection && current.length >= maxLength) {
                e.preventDefault();
              }
            }
          }
          onKeyDown?.(e);
        }}
        onPaste={(e) => {
          onPaste?.(e);
          if (e.defaultPrevented) return;

          e.preventDefault();
          const root = rootRef.current;
          if (!root) return;
          const plain = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r?\n+/g, ' ');

          const start = getSelectionOffset(root, false);
          const end = getSelectionOffset(root, true);
          const rawNext = `${value.slice(0, start)}${plain}${value.slice(end)}`;
          const rawCaret = start + plain.length;
          const nextState = clampWithSelection(rawNext, rawCaret, rawCaret, maxLength);
          pendingSelectionRef.current = { start: nextState.start, end: nextState.end };
          shouldScrollToBottomRef.current = plain.length > 0;
          onValueChange(nextState.value, nextState.start, nextState.end);
          onInput?.();
          if (plain.length > 0) {
            requestAnimationFrame(() => {
              const currentRoot = rootRef.current;
              if (!currentRoot) return;
              currentRoot.scrollTop = currentRoot.scrollHeight;
            });
          }
        }}
        onScroll={onScroll}
      />
    </div>
  );
});
