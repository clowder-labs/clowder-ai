'use client';

import type { MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

const HOVER_PREVIEW_WIDTH = 320;
const HOVER_PREVIEW_HEIGHT = 224;
const HOVER_PREVIEW_PADDING = 8;
const HOVER_PREVIEW_GAP = 12;

function SearchIcon() {
  return (
    <svg className="h-3 w-3 text-[#A5ADBA]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="h-3 w-3 text-[#7A8290]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
  titleTestId,
}: {
  item: PromptSelectionItem;
  titleTestId?: string;
}) {
  return (
    <>
      <h3 data-testid={titleTestId} className="text-[12px] font-semibold leading-none text-[#2E3542]">
        {item.title}
      </h3>
      <div className="mt-1 text-[10px] text-[#8A93A2]">创建人: {item.creator}</div>
      <div className="text-[10px] text-[#8A93A2]">创建时间: {item.createdAt}</div>
      <div className="mt-2 space-y-2">
        {buildFallbackSections(item).map((section) => (
          <section key={section.title}>
            <h4 className="text-[10px] font-semibold text-[#3F4654]">{section.title}</h4>
            <ul className="mt-1 space-y-1 text-[9px] leading-[1.55] text-[#555E6D]">
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
  title = '选择提示词',
  searchPlaceholder = '输入关键字搜索',
  cancelLabel = '取消',
  confirmLabel = '确定',
  onClose,
  onConfirm,
}: PromptSelectionModalProps) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [hoveredItemPosition, setHoveredItemPosition] = useState<{ left: number; top: number; width: number } | null>(
    null,
  );
  const hoverPreviewLayerRef = useRef<HTMLDivElement | null>(null);
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const hoveredItemTriggerRef = useRef<HTMLElement | null>(null);
  const hoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedId(initialSelectedId ?? items[0]?.id ?? null);
    setHoveredItemId(null);
    setHoveredItemPosition(null);
    hoveredItemTriggerRef.current = null;
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
    return (
      filteredItems.find((item) => item.id === selectedId) ??
      items.find((item) => item.id === selectedId) ??
      filteredItems[0]
    );
  }, [filteredItems, items, selectedId]);

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
    hoveredItemTriggerRef.current = null;
    setHoveredItemId(null);
    setHoveredItemPosition(null);
  }, []);

  const positionHoverPreview = useCallback((triggerElement: HTMLElement | null) => {
    const previewLayer = hoverPreviewLayerRef.current;
    const detailPanel = detailPanelRef.current;
    if (!previewLayer || !detailPanel || !triggerElement) return;

    const layerRect = previewLayer.getBoundingClientRect();
    const detailRect = detailPanel.getBoundingClientRect();
    const triggerRect = triggerElement.getBoundingClientRect();
    const preferredTop = triggerRect.top - layerRect.top + triggerRect.height / 2 - HOVER_PREVIEW_HEIGHT / 2;
    const maxTop = Math.max(HOVER_PREVIEW_PADDING, layerRect.height - HOVER_PREVIEW_HEIGHT - HOVER_PREVIEW_PADDING);
    const top =
      layerRect.height <= HOVER_PREVIEW_HEIGHT + HOVER_PREVIEW_PADDING * 2
        ? HOVER_PREVIEW_PADDING
        : Math.min(Math.max(preferredTop, HOVER_PREVIEW_PADDING), maxTop);

    setHoveredItemPosition({
      left: Math.round(detailRect.left - layerRect.left + HOVER_PREVIEW_GAP),
      top: Math.round(top),
      width: Math.max(HOVER_PREVIEW_WIDTH, Math.round(detailRect.width - HOVER_PREVIEW_GAP * 2)),
    });
  }, []);

  const handleHoverStart = useCallback(
    (itemId: string, triggerElement?: HTMLElement | null) => {
      if (hoverClearTimerRef.current) {
        clearTimeout(hoverClearTimerRef.current);
        hoverClearTimerRef.current = null;
      }

      const resolvedTrigger = triggerElement ?? hoveredItemTriggerRef.current;
      if (resolvedTrigger) {
        hoveredItemTriggerRef.current = resolvedTrigger;
        positionHoverPreview(resolvedTrigger);
      }

      setHoveredItemId(itemId);
    },
    [positionHoverPreview],
  );

  const handleHoverEnd = useCallback((itemId: string) => {
    hoverClearTimerRef.current = setTimeout(() => {
      setHoveredItemId((current) => {
        if (current !== itemId) return current;
        hoveredItemTriggerRef.current = null;
        setHoveredItemPosition(null);
        return null;
      });
      hoverClearTimerRef.current = null;
    }, 100);
  }, []);

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
    if (!hoveredItemId) return;

    const handleWindowResize = () => {
      positionHoverPreview(hoveredItemTriggerRef.current);
    };

    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [hoveredItemId, positionHoverPreview]);

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

  const showHoverPreview = Boolean(hoveredItem && hoveredItemPosition && hoveredItem.id !== selectedItem?.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-6 py-8"
      onClick={handleBackdropClick}
      data-testid="prompt-selection-modal"
    >
      <div className="flex w-[min(640px,96vw)] flex-col overflow-hidden rounded-[8px] bg-white shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
        <div className="flex h-[46px] items-center justify-between border-b border-[#E6EAF0] bg-white px-4">
          <h2 className="text-[16px] font-semibold leading-none text-[#1F1F1F]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 transition hover:bg-[#F5F7FB]"
            aria-label="关闭提示词选择"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-4 pt-3">
          <div className="flex items-center gap-2">
            <label className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-[4px] border border-[#D9E0EA] bg-white px-2">
              <SearchIcon />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full border-0 bg-transparent text-[10px] text-[#262626] outline-none placeholder:text-[#A5ADBA]"
                data-testid="prompt-search-input"
              />
            </label>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="flex h-6 w-6 items-center justify-center rounded-[4px] border border-[#D9E0EA] bg-white transition hover:bg-[#F7F9FC]"
              aria-label="刷新模板"
            >
              <RefreshIcon />
            </button>
          </div>

          <div
            ref={hoverPreviewLayerRef}
            className="relative flex h-[302px] min-h-0 overflow-hidden rounded-[6px] border border-[#E6EAF0] bg-white"
          >
            <aside className="flex h-full w-[172px] shrink-0 flex-col gap-2 overflow-y-auto px-0 py-2">
              {filteredItems.length === 0 ? (
                <div className="rounded-lg border border-[#EDF1F6] bg-white px-3 py-3 text-[11px] text-[#8C8C8C]">
                  没有匹配的提示词
                </div>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = item.id === selectedItem?.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(item.id);
                        if (hoveredItemId === item.id) {
                          clearHoverPreview();
                        }
                      }}
                      onMouseEnter={(event) => handleHoverStart(item.id, event.currentTarget)}
                      onMouseLeave={() => handleHoverEnd(item.id)}
                      onFocus={(event) => handleHoverStart(item.id, event.currentTarget)}
                      onBlur={() => handleHoverEnd(item.id)}
                      className={`rounded-lg px-3 py-2 text-left transition ${
                        isSelected
                          ? 'border border-[#86B1FF] bg-white'
                          : 'border border-[#EDF1F6] bg-white hover:bg-[#FAFCFF]'
                      }`}
                      data-testid={`prompt-list-item-${item.id}`}
                    >
                      <div className="text-[11px] font-semibold text-[#303744]">{item.title}</div>
                      <div className="mt-0.5 line-clamp-2 text-[9px] leading-[14px] text-[#969EAA]">
                        {item.summary ?? item.content}
                      </div>
                    </button>
                  );
                })
              )}
            </aside>

            <section
              ref={detailPanelRef}
              data-testid="prompt-detail-panel"
              className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[4px] border border-[#E7ECF3] bg-white p-3"
            >
              {selectedItem ? (
                <PromptDetailContent item={selectedItem} titleTestId="prompt-selected-title" />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-[#8C8C8C]">请选择左侧提示词</div>
              )}
            </section>

            {showHoverPreview ? (
              <div
                data-testid="prompt-hover-preview"
                className="absolute z-20"
                style={{
                  left: hoveredItemPosition!.left,
                  top: hoveredItemPosition!.top,
                  width: hoveredItemPosition!.width,
                }}
                onMouseEnter={() => handleHoverStart(hoveredItem!.id)}
                onMouseLeave={() => handleHoverEnd(hoveredItem!.id)}
              >
                <div className="relative max-h-[224px] overflow-hidden rounded-[8px] border border-[#DEE5EF] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(25,32,45,0.08)]">
                  <div className="max-h-[192px] overflow-y-auto pr-1">
                    <PromptDetailContent item={hoveredItem!} titleTestId="prompt-hover-preview-title" />
                  </div>
                </div>
                <div
                  aria-hidden="true"
                  data-testid="prompt-hover-preview-tail"
                  className="pointer-events-none absolute left-[-8px] top-1/2 h-4 w-4 -translate-y-1/2 rotate-45 border-b border-l border-[#DEE5EF] bg-white"
                />
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-6 min-w-[60px] rounded-full border border-[#C9D1DC] bg-white px-4 text-[10px] font-medium text-[#202020] transition hover:bg-[#FAFAFA]"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => selectedItem && onConfirm(selectedItem)}
              disabled={!selectedItem}
              className="h-6 min-w-[60px] rounded-full bg-[#1F2430] px-4 text-[10px] font-medium text-white transition hover:bg-[#111111] disabled:cursor-not-allowed disabled:bg-[#BFBFBF]"
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
