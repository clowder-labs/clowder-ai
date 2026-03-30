'use client';

import type { MouseEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface PromptSelectionItem {
  id: string;
  title: string;
  category: string;
  source: string;
  creator: string;
  createdAt: string;
  summary?: string;
  sections?: Array<{
    title: string;
    lines: string[];
  }>;
  content: string;
}

interface PromptSelectionModalProps {
  open: boolean;
  items: PromptSelectionItem[];
  initialSelectedId?: string | null;
  title?: string;
  searchPlaceholder?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (item: PromptSelectionItem) => void;
}

const MODAL_WIDTH = 900;
const MODAL_HEIGHT = 564;
const CONTENT_HEIGHT = 380;
const CARD_HEIGHT = 68;
const LIST_WIDTH = 240;
const DETAIL_WIDTH = 596;
const HOVER_PREVIEW_WIDTH = 320;
const HOVER_GAP = 12;
const HOVER_PADDING = 12;

type HoverPosition = {
  left: number;
  top: number;
  tailTop: number;
};

function SearchIcon() {
  return (
    <svg className="h-4 w-4 text-[#A5ADBA]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="h-[18px] w-[18px] text-[#7A8290]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 11A8 8 0 1 0 17.66 16.66"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M20 4V11H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-[18px] w-[18px] text-[#97A0AE]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function buildFallbackSections(item: PromptSelectionItem): Array<{ title: string; lines: string[] }> {
  if (item.sections?.length) return item.sections;
  return [{ title: item.category, lines: item.content.split('\n').filter(Boolean) }];
}

function PromptDetailContent({
  item,
  compact = false,
  titleTestId,
}: {
  item: PromptSelectionItem;
  compact?: boolean;
  titleTestId?: string;
}) {
  const titleClass = compact ? 'text-[15px]' : 'text-[18px]';
  const sectionTitleClass = compact ? 'text-[13px]' : 'text-[14px]';
  const bodyClass = compact ? 'text-[11px] leading-6' : 'text-[13px] leading-7';

  return (
    <>
      <h3 data-testid={titleTestId} className={`font-semibold leading-none text-[#2E3542] ${titleClass}`}>
        {item.title}
      </h3>
      <div className={compact ? 'mt-4 space-y-4' : 'mt-6 space-y-5'}>
        {buildFallbackSections(item).map((section) => (
          <section key={section.title}>
            <h4 className={`font-semibold text-[#3F4654] ${sectionTitleClass}`}>{section.title}</h4>
            <ul className={`mt-2 space-y-1 text-[#555E6D] ${bodyClass}`}>
              {section.lines.map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

export function PromptSelectionModal({
  open,
  items,
  initialSelectedId = null,
  title = '灵魂模板',
  searchPlaceholder = '输入关键字搜索',
  cancelLabel = '取消',
  confirmLabel = '插入',
  onClose,
  onConfirm,
}: PromptSelectionModalProps) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [hoverPosition, setHoverPosition] = useState<HoverPosition | null>(null);
  const hoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverLayerRef = useRef<HTMLDivElement | null>(null);
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const hoveredTriggerRef = useRef<HTMLElement | null>(null);
  const hoverPreviewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedId(initialSelectedId ?? items[0]?.id ?? null);
    setHoveredItemId(null);
    setHoverPosition(null);
    hoveredTriggerRef.current = null;
  }, [initialSelectedId, items, open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const filteredItems = useMemo(() => {
    const normalized = normalizeSearch(query);
    if (!normalized) return items;

    return items.filter((item) =>
      [item.title, item.category, item.source, item.creator, item.summary ?? '', item.content].some((field) =>
        field.toLowerCase().includes(normalized),
      ),
    );
  }, [items, query]);

  const selectedItem = useMemo(() => {
    if (filteredItems.length === 0) return null;
    return filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0];
  }, [filteredItems, selectedId]);

  const hoveredItem = useMemo(() => {
    if (!hoveredItemId) return null;
    return filteredItems.find((item) => item.id === hoveredItemId) ?? items.find((item) => item.id === hoveredItemId) ?? null;
  }, [filteredItems, hoveredItemId, items]);

  useEffect(() => {
    if (!open) return;
    if (!selectedItem) {
      setSelectedId(null);
      return;
    }
    if (selectedItem.id !== selectedId) {
      setSelectedId(selectedItem.id);
    }
  }, [open, selectedId, selectedItem]);

  const clearHoverPreview = useCallback(() => {
    if (hoverClearTimerRef.current) {
      clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }
    hoveredTriggerRef.current = null;
    setHoveredItemId(null);
    setHoverPosition(null);
  }, []);

  const positionHoverPreview = useCallback(() => {
    const layer = hoverLayerRef.current;
    const trigger = hoveredTriggerRef.current;
    const preview = hoverPreviewRef.current;
    if (!layer || !trigger || !preview) return;

    const layerRect = layer.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();

    const centerY = triggerRect.top - layerRect.top + triggerRect.height / 2;
    const unclampedTop = centerY - previewRect.height / 2;
    const maxTop = Math.max(HOVER_PADDING, layerRect.height - previewRect.height - HOVER_PADDING);
    const top = Math.min(Math.max(unclampedTop, HOVER_PADDING), maxTop);

    const tailCenter = Math.min(Math.max(centerY - top, 18), Math.max(18, previewRect.height - 18));

    setHoverPosition({
      left: Math.round(triggerRect.right - layerRect.left + HOVER_GAP),
      top: Math.round(top),
      tailTop: Math.round(tailCenter - 8),
    });
  }, []);

  const handleHoverStart = useCallback((itemId: string, triggerElement?: HTMLElement | null) => {
    if (hoverClearTimerRef.current) {
      clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }

    if (triggerElement) {
      hoveredTriggerRef.current = triggerElement;
    }

    setHoveredItemId(itemId);
  }, []);

  const handleHoverEnd = useCallback((itemId: string) => {
    hoverClearTimerRef.current = setTimeout(() => {
      setHoveredItemId((current) => {
        if (current !== itemId) return current;
        hoveredTriggerRef.current = null;
        setHoverPosition(null);
        return null;
      });
      hoverClearTimerRef.current = null;
    }, 100);
  }, []);

  useLayoutEffect(() => {
    if (!hoveredItemId || !hoveredItem) {
      setHoverPosition(null);
      return;
    }

    positionHoverPreview();

    const handleWindowResize = () => positionHoverPreview();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [hoveredItem, hoveredItemId, positionHoverPreview]);

  useEffect(() => {
    if (!open) {
      clearHoverPreview();
    }
  }, [clearHoverPreview, open]);

  useEffect(() => {
    if (!hoveredItemId) return;
    if (filteredItems.some((item) => item.id === hoveredItemId)) return;
    clearHoverPreview();
  }, [clearHoverPreview, filteredItems, hoveredItemId]);

  useEffect(() => {
    return () => {
      if (hoverClearTimerRef.current) {
        clearTimeout(hoverClearTimerRef.current);
      }
    };
  }, []);

  if (!open) return null;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const hoveredPreview = hoveredItem && hoverPosition ? { item: hoveredItem, position: hoverPosition } : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-6 py-8"
      onClick={handleBackdropClick}
      data-testid="prompt-selection-modal"
    >
      <div
        className="flex w-full max-w-[900px] flex-col overflow-hidden rounded-[14px] bg-white p-6 shadow-[0_16px_48px_rgba(15,23,42,0.16)]"
        style={{ width: MODAL_WIDTH, height: MODAL_HEIGHT }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] font-semibold leading-none text-[#1F2329]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 transition hover:bg-[#F5F7FB]"
            aria-label="关闭提示词选择"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-3">
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-[#D9E0EA] bg-white px-3">
              <SearchIcon />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full border-0 bg-transparent text-[13px] text-[#262626] outline-none placeholder:text-[#A5ADBA]"
                data-testid="prompt-search-input"
              />
            </label>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#D9E0EA] bg-white transition hover:bg-[#F7F9FC]"
              aria-label="刷新模板"
            >
              <RefreshIcon />
            </button>
          </div>

          <div ref={hoverLayerRef} className="relative mt-4 flex min-h-0 gap-4" style={{ height: CONTENT_HEIGHT }}>
            <aside
              className="flex shrink-0 flex-col gap-2 overflow-x-hidden overflow-y-auto rounded-[10px] border border-[#E6EAF0] bg-white p-0.5"
              style={{ width: LIST_WIDTH, height: CONTENT_HEIGHT }}
            >
              {filteredItems.length === 0 ? (
                <div className="rounded-[10px] border border-[#EDF1F6] bg-[#fafafa] px-3 py-4 text-[12px] text-[#8C8C8C]">
                  没有匹配的提示词
                </div>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = item.id === selectedItem?.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      onMouseEnter={(event) => handleHoverStart(item.id, event.currentTarget)}
                      onMouseLeave={() => handleHoverEnd(item.id)}
                      onFocus={(event) => handleHoverStart(item.id, event.currentTarget)}
                      onBlur={() => handleHoverEnd(item.id)}
                      className={`block h-[68px] min-h-[68px] w-full shrink-0 overflow-hidden rounded-[10px] px-4 py-[10px] text-left transition ${
                        isSelected
                          ? 'border border-[#86B1FF] bg-white shadow-[0_4px_12px_rgba(134,177,255,0.12)]'
                          : 'border border-[#EDF1F6] bg-[#fafafa] hover:bg-white'
                      }`}
                      data-testid={`prompt-list-item-${item.id}`}
                    >
                      <div className="flex h-full min-w-0 w-full flex-col justify-center overflow-hidden">
                        <div className="h-[22px] w-full truncate text-[14px] font-semibold leading-[22px] text-[#303744]">
                          {item.title}
                        </div>
                        <div className="mt-1 h-[18px] w-full truncate overflow-hidden text-[12px] leading-[18px] text-[#969EAA]">
                          {item.summary ?? item.content}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </aside>

            <section
              ref={detailPanelRef}
              data-testid="prompt-detail-panel"
              className="flex min-h-0 flex-col overflow-y-auto rounded-[10px] border border-[#E7ECF3] bg-white p-5"
              style={{ width: DETAIL_WIDTH, height: CONTENT_HEIGHT }}
            >
              {selectedItem ? (
                <PromptDetailContent item={selectedItem} titleTestId="prompt-selected-title" />
              ) : (
                <div className="flex h-full items-center justify-center text-[13px] text-[#8C8C8C]">请选择左侧提示词</div>
              )}
            </section>

            {hoveredItem ? (
              <div
                ref={hoverPreviewRef}
                data-testid="prompt-hover-preview"
                className="absolute z-20"
                style={{
                  left: hoveredPreview?.position.left ?? 0,
                  top: hoveredPreview?.position.top ?? 0,
                  width: HOVER_PREVIEW_WIDTH,
                  visibility: hoveredPreview ? 'visible' : 'hidden',
                }}
                onMouseEnter={() => handleHoverStart(hoveredItem.id)}
                onMouseLeave={() => handleHoverEnd(hoveredItem.id)}
              >
                <div className="relative rounded-[12px] border border-[#DEE5EF] bg-white px-5 py-4 shadow-[0_12px_32px_rgba(25,32,45,0.12)]">
                  <PromptDetailContent item={hoveredItem} compact titleTestId="prompt-hover-preview-title" />
                  <div
                    aria-hidden="true"
                    data-testid="prompt-hover-preview-tail"
                    className="pointer-events-none absolute -left-[9px] h-[18px] w-[18px] rotate-45 border-b border-l border-[#DEE5EF] bg-white"
                    style={{ top: hoveredPreview?.position.tailTop ?? 24 }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-7 min-w-[84px] rounded-full border border-[#C9D1DC] bg-white px-4 text-[14px] font-medium text-[#202020] transition hover:bg-[#FAFAFA]"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => selectedItem && onConfirm(selectedItem)}
              disabled={!selectedItem}
              className="h-7 min-w-[84px] rounded-full bg-[#1F2430] px-4 text-[14px] font-medium text-white transition hover:bg-[#111111] disabled:cursor-not-allowed disabled:bg-[#BFBFBF]"
              data-testid="prompt-confirm-button"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const DEFAULT_PROMPT_SELECTION_ITEMS: PromptSelectionItem[] = [
  {
    id: 'product-copy',
    title: '产品文案创意',
    category: '文案创作',
    source: '文案创作',
    creator: '官方预置',
    createdAt: '2025-09-12 17:22:30',
    summary: '聚焦产品价值提炼、卖点表达与场景化文案呈现。',
    content: '你是一位专业的产品文案创意人员，需要围绕产品卖点、用户价值与场景化表达产出简洁有力的文案。',
  },
  {
    id: 'tongue-twister',
    title: '绕口令优化',
    category: '文案创作',
    source: '文案创作',
    creator: '官方预置',
    createdAt: '2025-09-12 17:22:30',
    summary: '优化节奏、押韵和传播性，提升趣味和朗读体验。',
    content: '请对现有绕口令进行节奏、押韵和发音难度优化，并保留趣味性与传播性。',
  },
  {
    id: 'pet-consultant',
    title: '宠物行为咨询师',
    category: '生活服务',
    source: '生活服务',
    creator: '官方预置',
    createdAt: '2025-09-12 17:22:30',
    summary: '结合宠物品种、年龄和具体表现，提供训练与安抚建议。',
    content: '你将扮演宠物行为咨询师，结合宠物品种、年龄和具体表现，提供训练与安抚建议。',
  },
];
