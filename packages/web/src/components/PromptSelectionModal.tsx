'use client';

import type { MouseEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';

export interface PromptSelectionItem {
  id: string;
  title: string;
  category: string;
  source: string;
  creator: string;
  createdAt: string;
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

function SearchIcon() {
  return (
    <svg className="h-5 w-5 text-[#BFBFBF]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="h-5 w-5 text-[#262626]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    <svg className="h-6 w-6 text-[#8C8C8C]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

export function PromptSelectionModal({
  open,
  items,
  initialSelectedId = null,
  title = '选择提示词',
  searchPlaceholder = '选择属性筛选，或输入关键字搜索',
  cancelLabel = '取消',
  confirmLabel = '确定',
  onClose,
  onConfirm,
}: PromptSelectionModalProps) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedId(initialSelectedId ?? items[0]?.id ?? null);
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
      [item.title, item.category, item.source, item.creator, item.content].some((field) =>
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

  if (!open) return null;

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-6 py-8"
      onClick={handleBackdropClick}
      data-testid="prompt-selection-modal"
    >
      <div className="flex h-[min(1040px,92vh)] w-[min(1480px,96vw)] flex-col overflow-hidden rounded-[18px] bg-[#F5F5F5] shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="flex h-[92px] items-center justify-between border-b border-[#E8E8E8] bg-white px-8">
          <h2 className="text-[28px] font-semibold leading-none text-[#1F1F1F]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 transition hover:bg-[#F5F5F5]"
            aria-label="关闭提示词选择"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6 p-6">
          <div className="flex items-center gap-3">
            <label className="flex h-14 min-w-0 flex-1 items-center gap-3 rounded-[14px] border border-[#D9D9D9] bg-white px-[18px]">
              <SearchIcon />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="w-full border-0 bg-transparent text-lg text-[#262626] outline-none placeholder:text-[#B3B3B3]"
                data-testid="prompt-search-input"
              />
            </label>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="flex h-14 w-14 items-center justify-center rounded-[14px] border border-[#D9D9D9] bg-white transition hover:bg-[#FAFAFA]"
              aria-label="清空搜索"
            >
              <RefreshIcon />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 overflow-hidden rounded-[18px] border border-[#D9D9D9] bg-white">
            <aside className="flex h-full w-[540px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-[#E5E5E5] p-[18px]">
              {filteredItems.length === 0 ? (
                <div className="rounded-2xl bg-[#FAFAFA] px-7 py-8 text-base text-[#8C8C8C]">没有匹配的提示词</div>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = item.id === selectedItem?.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`rounded-2xl px-7 py-6 text-left transition ${
                        isSelected
                          ? 'bg-white shadow-[0_0_0_2px_#2F76FF_inset]'
                          : 'bg-[#FAFAFA] hover:bg-[#F3F3F3]'
                      }`}
                      data-testid={`prompt-list-item-${item.id}`}
                    >
                      <div className="text-2xl font-semibold text-[#111111]">{item.title}</div>
                      <div className="mt-4 text-lg text-[#8C8C8C]">来自: {item.source}</div>
                    </button>
                  );
                })
              )}
            </aside>

            <section className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-[42px] pb-8 pt-10">
              {selectedItem ? (
                <>
                  <h3 className="text-[28px] font-semibold leading-none text-[#111111]">{selectedItem.title}</h3>
                  <div className="whitespace-pre-wrap text-lg leading-[1.7] text-[#7A7A7A]">{selectedItem.content}</div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-lg text-[#8C8C8C]">请选择左侧提示词</div>
              )}
            </section>
          </div>

          <div className="flex justify-end gap-[18px] px-1 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-14 min-w-[164px] rounded-full border-[1.5px] border-[#5A5A5A] bg-white px-8 text-lg font-medium text-[#202020] transition hover:bg-[#FAFAFA]"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => selectedItem && onConfirm(selectedItem)}
              disabled={!selectedItem}
              className="h-14 min-w-[164px] rounded-full bg-[#1F1F1F] px-8 text-lg font-medium text-white transition hover:bg-[#111111] disabled:cursor-not-allowed disabled:bg-[#BFBFBF]"
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
    content:
      '你是一位专业的产品文案创意人员，现在需要为一款全新发布的手机撰写一篇吸引目标消费者的文案。请根据该手机的核心功能、技术亮点和用户价值，创作一段简洁有力、富有感染力的文案，让消费者在短时间内理解并认同这款手机的优势与独特之处。\n\n要求如下：\n1. 突出核心卖点：如性能、拍照、屏幕、续航、设计、系统体验等，重点强调与竞品相比的差异化优势。\n2. 语言简洁易懂：避免使用过于技术化的术语，用通俗、生动的语言传达产品价值。\n3. 引发情感共鸣：结合用户使用场景，让文案更具代入感和吸引力。',
  },
  {
    id: 'tongue-twister',
    title: '绕口令优化',
    category: '文案创作',
    source: '文案创作',
    creator: '官方预置',
    createdAt: '2025-09-12 17:22:30',
    content: '请对现有绕口令进行节奏、押韵和发音难度的优化，并保留趣味性与传播性。',
  },
  {
    id: 'pet-consultant',
    title: '宠物行为咨询师',
    category: '生活服务',
    source: '生活服务',
    creator: '官方预置',
    createdAt: '2025-09-12 17:22:30',
    content: '你将扮演宠物行为咨询师，结合宠物品种、年龄和具体表现，提供训练与安抚建议。',
  },
];
