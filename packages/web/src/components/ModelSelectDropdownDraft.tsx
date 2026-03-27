'use client';

import { useMemo, useState } from 'react';

export interface DraftModelOption {
  id: string;
  name: string;
  providerGroup?: string;
  statusText?: string;
  rightLabel?: string;
}

interface ModelSelectDropdownDraftProps {
  items: DraftModelOption[];
  selectedId?: string | null;
  searchPlaceholder?: string;
  groupLabel?: string;
  onSelect?: (item: DraftModelOption) => void;
}

function SearchIcon() {
  return (
    <svg className="h-[18px] w-[18px] text-[#A4ADBA]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckedIcon() {
  return (
    <svg className="h-[18px] w-[18px] text-[#2F76FF]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 12.5L10.6 15L16 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UncheckedIcon() {
  return (
    <svg className="h-[18px] w-[18px] text-[#C2C9D3]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function ModelSelectDropdownDraft({
  items,
  selectedId = null,
  searchPlaceholder = '请输入关键字搜索',
  groupLabel = '华为云 MaaS',
  onSelect,
}: ModelSelectDropdownDraftProps) {
  const [query, setQuery] = useState('');

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => item.name.toLowerCase().includes(normalized));
  }, [items, query]);

  return (
    <div className="flex w-[520px] flex-col overflow-hidden rounded-[14px] border border-[#DDE3EC] bg-white shadow-[0_16px_36px_rgba(0,0,0,0.10)]">
      <div className="flex flex-col gap-2.5 px-4 pb-0 pt-4">
        <label className="flex h-10 items-center gap-2.5 rounded-full border border-[#D8DEE8] bg-white px-3.5">
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full border-0 bg-transparent text-[13px] text-[#2D3643] outline-none placeholder:text-[#A4ADBA]"
          />
        </label>
        <div className="text-xs font-medium text-[#8F98A7]">{groupLabel}</div>
      </div>

      <div className="flex max-h-[320px] flex-col overflow-y-auto px-2 py-2">
        {filteredItems.map((item) => {
          const isSelected = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect?.(item)}
              className={`flex h-11 items-center justify-between rounded-[10px] px-2.5 text-left transition ${
                isSelected ? 'bg-[#F4F8FF]' : 'bg-white hover:bg-[#F7F9FC]'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {isSelected ? <CheckedIcon /> : <UncheckedIcon />}
                <span className={`truncate text-sm ${isSelected ? 'font-medium text-[#2D3643]' : 'text-[#2D3643]'}`}>
                  {item.name}
                </span>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                {item.statusText ? <span className="text-xs text-[#8F98A7]">{item.statusText}</span> : null}
                {item.rightLabel ? <span className="text-xs font-medium text-[#2D3643]">{item.rightLabel}</span> : null}
              </div>
            </button>
          );
        })}
        {filteredItems.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-[#8F98A7]">没有匹配的模型</div>
        ) : null}
      </div>
    </div>
  );
}

export const DRAFT_MODEL_OPTIONS: DraftModelOption[] = [
  { id: 'deepseek-v3-2', name: 'DeepSeek-V3.2', rightLabel: '工具' },
  { id: 'deepseek-v3-1', name: 'DeepSeek-V3.1', statusText: '已开通' },
  { id: 'qwen3-coder-480b-a35b', name: 'Qwen3-Coder-480B-A35B', statusText: '已开通' },
  { id: 'qwen3-32b', name: 'Qwen3-32B', statusText: '已开通' },
  { id: 'qwen3-235b-a22b-32k', name: 'Qwen3-235B-A22B-32K', statusText: '已开通' },
];
