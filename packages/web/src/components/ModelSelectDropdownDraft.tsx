'use client';

import { useMemo, useState } from 'react';
import { groupKeyFromModelName, modelIconVisual, resolveModelIconType } from './model-icon';

export interface DraftModelOption {
  id: string;
  name: string;
  providerGroup?: string;
  experienceText?: string;
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

interface ModelSelectValueDraftProps {
  item?: DraftModelOption | null;
  placeholder?: string;
  loading?: boolean;
}

type CapabilityKind = 'reasoning' | 'tool' | 'text';

function SearchIcon() {
  return (
    <svg className="h-3 w-3 text-[#A4ADBA]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-4 w-4 text-[#8D97A6]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ToolIcon() {
  return (
    <svg className="h-3 w-3 text-[#F59B23]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14.7 6.3a4.5 4.5 0 0 0 3.3 6.9l-8.4 8.4a2 2 0 1 1-2.8-2.8l8.4-8.4a4.5 4.5 0 0 1-5.8-5.5l3 3 2.5-2.5-2.2-3.1z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReasoningIcon() {
  return (
    <svg className="h-3 w-3 text-[#9B5CFF]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4.2a7.8 7.8 0 1 0 0 15.6a7.8 7.8 0 0 0 0-15.6Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.4v9.2M7.4 12h9.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TextBadge() {
  return (
    <span className="flex h-[14px] w-[14px] items-center justify-center rounded-[3px] border border-[#6AA8FF] bg-white text-[9px] font-semibold leading-none text-[#2F76FF]">
      T
    </span>
  );
}

function getCapabilities(item: DraftModelOption): CapabilityKind[] {
  const normalized = item.name.toLowerCase();
  const capabilities: CapabilityKind[] = [];

  if (normalized.includes('qwen3-32b') || normalized.includes('qwen3-235b') || normalized.includes('qwen3-30b')) {
    capabilities.push('reasoning');
  }

  if (
    normalized.includes('deepseek') ||
    normalized.includes('coder') ||
    normalized.includes('qwen3-32b') ||
    normalized.includes('qwen3-235b') ||
    normalized.includes('qwen3-30b') ||
    item.rightLabel?.includes('工具')
  ) {
    capabilities.push('tool');
  }

  capabilities.push('text');
  return capabilities;
}

function renderCapability(kind: CapabilityKind, itemId: string) {
  if (kind === 'reasoning') {
    return (
      <span key={`${itemId}-reasoning`} data-testid={`capability-reasoning-${itemId}`}>
        <ReasoningIcon />
      </span>
    );
  }
  if (kind === 'tool') {
    return (
      <span key={`${itemId}-tool`} data-testid={`capability-tool-${itemId}`}>
        <ToolIcon />
      </span>
    );
  }
  return (
    <span key={`${itemId}-text`} data-testid={`capability-text-${itemId}`}>
      <TextBadge />
    </span>
  );
}

function ModelIcon({ item }: { item: DraftModelOption }) {
  const visual = modelIconVisual(resolveModelIconType(groupKeyFromModelName(item.name)));
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={visual.imageSrc}
      alt={visual.label}
      data-testid={`model-logo-${item.name}`}
      className="h-[18px] w-[18px] shrink-0 object-contain"
    />
  );
}

export function ModelSelectValueDraft({
  item,
  placeholder = '请选择模型',
  loading = false,
}: ModelSelectValueDraftProps) {
  return (
    <span className={`truncate text-[12px] ${item ? 'text-[#2D3643]' : 'text-[#A4ADBA]'}`}>
      {loading ? '加载模型中...' : item?.name ?? placeholder}
    </span>
  );
}

export function ModelSelectTriggerIcon() {
  return <ChevronDownIcon />;
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

    return items.filter((item) => {
      const haystack = [item.name, item.providerGroup, item.experienceText, item.statusText, item.rightLabel]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [items, query]);

  return (
    <div className="flex w-[476px] flex-col overflow-hidden rounded-[8px] border border-[#DDE3EC] bg-white shadow-[0_10px_24px_rgba(0,0,0,0.09)]">
      <div className="flex flex-col gap-1.5 px-[10px] pb-0 pt-[10px]">
        <label className="flex h-7 items-center gap-1.5 rounded-[14px] border border-[#D8DEE8] bg-white px-[10px]">
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full border-0 bg-transparent text-[10px] text-[#2D3643] outline-none placeholder:text-[#A4ADBA]"
          />
        </label>
        <div className="text-[10px] font-medium text-[#8F98A7]">{groupLabel}</div>
      </div>

      <div role="listbox" className="flex max-h-[320px] flex-col gap-0.5 overflow-y-auto px-2 pb-2 pt-1">
        {filteredItems.map((item) => {
          const isSelected = item.id === selectedId;
          const rowHeight = isSelected ? 'h-8' : 'h-7';
          const capabilities = getCapabilities(item);

          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              data-testid={`model-row-${item.id}`}
              onClick={() => onSelect?.(item)}
              className={`${rowHeight} flex items-center justify-between rounded-[6px] px-2 text-left transition ${
                isSelected ? 'bg-[#F4F8FF]' : 'bg-white hover:bg-[#F7F9FC]'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <ModelIcon item={item} />
                <span className={`truncate text-[14px] leading-none text-[#2D3643] ${isSelected ? 'font-medium' : 'font-normal'}`}>
                  {item.name}
                </span>
              </div>

              <div className="ml-3 flex shrink-0 items-center gap-1">
                {item.experienceText ? <span className="text-[10px] text-[#7D8593]">{item.experienceText}</span> : null}
                {item.statusText ? <span className="text-[10px] text-[#7D8593]">{item.statusText}</span> : null}
                {capabilities.map((capability) => renderCapability(capability, item.id))}
                {item.rightLabel ? (
                  <span className="rounded-[6px] border border-[#E1E6EF] bg-white px-2 py-1 text-[10px] font-medium leading-none text-[#5F6675]">
                    {item.rightLabel}
                  </span>
                ) : null}
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
  {
    id: 'deepseek-v3-2',
    name: 'DeepSeek-V3.2',
    experienceText: '限额体验',
    statusText: '已开通',
    rightLabel: '工具',
  },
  {
    id: 'deepseek-v3-1',
    name: 'DeepSeek-V3.1',
    experienceText: '限额体验',
    statusText: '已开通',
  },
  { id: 'deepseek-v3', name: 'DeepSeek-V3', statusText: '已开通' },
  {
    id: 'qwen3-coder-480b-a35b',
    name: 'Qwen3-Coder-480B-A35B',
    experienceText: '限额体验',
    statusText: '已开通',
  },
  { id: 'qwen3-32b', name: 'Qwen3-32B', statusText: '已开通' },
  { id: 'qwen3-235b-a22b-32k', name: 'Qwen3-235B-A22B-32K', statusText: '已开通' },
  { id: 'qwen3-30b-a3b', name: 'Qwen3-30B-A3B', statusText: '已开通' },
];
