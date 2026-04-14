/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import type { CapabilityBoardItem, CapabilityBoardResponse, CatFamily, ToggleHandler } from './capability-board-ui';
import { CapabilityCard } from './capability-board-ui';
import { CenteredLoadingState } from './shared/CenteredLoadingState';
import { EmptyDataState } from './shared/EmptyDataState';
import { NoSearchResultsState } from './shared/NoSearchResultsState';
import { SearchInput } from './shared/SearchInput';
import { useConfirm } from './useConfirm';

const ALL_CATEGORY = '全部';
const UNCATEGORIZED = '其他';
const ALL_SOURCES = 'all';
const SKILL_SEARCH_PLACEHOLDER = '请输入名称或描述搜索';
const SKILL_SEARCH_ARIA_LABEL = '搜索我的技能';
const SOURCE_FILTER_ARIA_LABEL = '筛选来源';
const IMPORT_LABEL = '导入';
export interface SelectedSkillSummary {
  skillName: string;
  avatarUrl?: string | null;
}

function sourceToLabel(source: string): string {
  if (source === 'builtin') return '内置技能';
  if (source === 'external') return '用户添加技能';
  return '其他';
}

export function HubCapabilityTab({
  hideSkillMountStatus,
  onImport,
  onSelectSkill,
  refreshSignal,
}: {
  hideSkillMountStatus?: boolean;
  onImport?: () => void;
  onSelectSkill?: (selection: SelectedSkillSummary) => void;
  refreshSignal?: number;
}) {
  const [items, setItems] = useState<CapabilityBoardItem[]>([]);
  const [catFamilies, setCatFamilies] = useState<CatFamily[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSource, setActiveSource] = useState(ALL_SOURCES);
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const sourceMenuRef = useRef<HTMLDivElement>(null);

  const confirm = useConfirm();

  const fetchCapabilities = useCallback(async () => {
    setError(null);
    try {
      const query = new URLSearchParams();
      query.set('probe', 'true');
      const res = await apiFetch(`/api/capabilities?${query.toString()}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        setError((data.error as string) ?? '加载失败');
        return;
      }
      const data = (await res.json()) as CapabilityBoardResponse;
      setItems(data.items);
      setCatFamilies(data.catFamilies);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCapabilities();
  }, [fetchCapabilities, refreshSignal]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchCapabilities();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchCapabilities]);

  const handleToggle: ToggleHandler = useCallback(
    async (capabilityId, capabilityType, enabled, scope = 'global', catId) => {
      const toggleKey = catId ? `${capabilityType}:${capabilityId}:${catId}` : `${capabilityType}:${capabilityId}`;
      setToggling(toggleKey);
      try {
        const body: Record<string, unknown> = {
          capabilityId,
          capabilityType,
          scope,
          enabled,
        };
        if (catId) body.catId = catId;

        const res = await apiFetch('/api/capabilities', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          setError((data.error as string) ?? `开关失败 (${res.status})`);
          return;
        }
        await fetchCapabilities();
      } catch {
        setError('网络错误');
      } finally {
        setToggling(null);
      }
    },
    [fetchCapabilities],
  );

  const handleUninstall = useCallback(
    async (skillId: string) => {
      const ok = await confirm({
        title: '卸载技能',
        message: `确定要卸载 “${skillId}” 吗？此操作不可恢复。`,
        confirmLabel: '卸载',
        cancelLabel: '取消',
        variant: 'default',
      });
      if (!ok) return;
      try {
        const res = await apiFetch('/api/skills/uninstall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: skillId }),
        });
        if (res.ok) {
          await fetchCapabilities();
        }
      } catch {
        // ignore
      }
    },
    [confirm, fetchCapabilities],
  );

  const visibleItems = useMemo(() => items.filter((item) => item.type !== 'mcp'), [items]);
  const skillItems = useMemo(() => visibleItems.filter((item) => item.type === 'skill'), [visibleItems]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of skillItems) {
      const category = item.category?.trim() || UNCATEGORIZED;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return counts;
  }, [skillItems]);
  const categoryTabs = useMemo(() => {
    const tabs = [ALL_CATEGORY];
    const categories = Array.from(categoryCounts.keys());
    const ordered = categories.filter((category) => category !== UNCATEGORIZED);
    if (categories.includes(UNCATEGORIZED)) ordered.push(UNCATEGORIZED);
    tabs.push(...ordered);
    return tabs;
  }, [categoryCounts]);
  const displayedSkillItems = useMemo(() => {
    if (activeCategory === ALL_CATEGORY) return skillItems;
    return skillItems.filter((item) => (item.category?.trim() || UNCATEGORIZED) === activeCategory);
  }, [activeCategory, skillItems]);
  const sourceOptions = useMemo(() => {
    const options = Array.from(new Set(skillItems.map((item) => item.source).filter(Boolean)));
    return [ALL_SOURCES, ...options];
  }, [skillItems]);
  const sourceFilteredItems = useMemo(() => {
    if (activeSource === ALL_SOURCES) return displayedSkillItems;
    return displayedSkillItems.filter((item) => item.source === activeSource);
  }, [activeSource, displayedSkillItems]);
  const normalizedSearchQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);
  const filteredDisplayedSkillItems = useMemo(() => {
    if (!normalizedSearchQuery) return sourceFilteredItems;
    return sourceFilteredItems.filter((item) => {
      const sourceLabel = item.source === 'builtin' ? '内置技能' : item.source === 'external' ? '用户添加技能' : '其他';
      const haystack = [item.id, item.description ?? '', item.category ?? '', sourceLabel].join(' ').toLowerCase();
      return haystack.includes(normalizedSearchQuery);
    });
  }, [sourceFilteredItems, normalizedSearchQuery]);

  useEffect(() => {
    if (!categoryTabs.includes(activeCategory)) setActiveCategory(ALL_CATEGORY);
  }, [activeCategory, categoryTabs]);

  useEffect(() => {
    if (!isSourceMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (sourceMenuRef.current?.contains(target)) return;
      setIsSourceMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isSourceMenuOpen]);

  const handleCategoryChange = useCallback((category: string) => {
    setSearchQuery('');
    setActiveCategory(category);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setActiveSource(ALL_SOURCES);
  }, []);

  const activeSourceLabel = useMemo(
    () => (activeSource === ALL_SOURCES ? '全部来源' : sourceToLabel(activeSource)),
    [activeSource],
  );

  if (loading) return <CenteredLoadingState />;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {error && <p className="ui-status-error rounded-[var(--radius-md)] px-3 py-2 text-sm">{error}</p>}

      <div data-testid="hub-capability-fixed-header">
        <div className="flex flex-wrap items-center gap-4">
          {categoryTabs.map((category, index) => (
            <div key={category} className="flex items-center">
              {index > 0 ? <div aria-hidden="true" className="mr-4 h-4 w-px self-center bg-[#dbdbdb]" /> : null}
              <button
                type="button"
                onClick={() => handleCategoryChange(category)}
                className={`inline-flex min-h-7 items-center leading-none text-sm transition-colors ${activeCategory === category
                    ? 'font-semibold text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
              >
                {category}
              </button>
            </div>
          ))}
        </div>
        <div className="pt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[20px] font-semibold">{`${activeCategory} (${filteredDisplayedSkillItems.length})`}</p>
            {onImport ? (
              <button
                type="button"
                onClick={onImport}
                className="ui-button-primary min-h-[var(--control-height-touch)] shrink-0 sm:min-h-[var(--control-height-sm)]"
              >
                {IMPORT_LABEL}
              </button>
            ) : null}
          </div>
          <div className="py-6">
            <div className="flex items-center gap-2">
              <div ref={sourceMenuRef} className="relative w-[200px] shrink-0">
                <select
                  aria-label={SOURCE_FILTER_ARIA_LABEL}
                  value={activeSource}
                  onChange={(event) => setActiveSource(event.target.value)}
                  className="sr-only"
                  tabIndex={-1}
                >
                  {sourceOptions.map((source) => (
                    <option key={source} value={source}>
                      {source === ALL_SOURCES ? '全部来源' : sourceToLabel(source)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsSourceMenuOpen((prev) => !prev)}
                  className={`ui-field flex h-[28px] w-[200px] items-center justify-between rounded-[6px] px-[12px] py-[5px] text-xs transition-colors ${
                    isSourceMenuOpen ? 'border-[#191919]' : ''
                  }`}
                  aria-haspopup="listbox"
                  aria-expanded={isSourceMenuOpen}
                >
                  <span className="truncate text-[var(--text-primary)]">{activeSourceLabel}</span>
                  <svg
                    className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform duration-200 ${
                      isSourceMenuOpen ? 'rotate-180' : ''
                    }`}
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {isSourceMenuOpen ? (
                  <div
                    role="listbox"
                    className="absolute left-0 top-[calc(100%+4px)] z-30 w-[200px] rounded-[6px] bg-white py-[8px] shadow-[0_2px_12px_0_rgba(0,0,0,0.16)]"
                  >
                    {sourceOptions.map((source) => {
                      const isSelected = source === activeSource;
                      return (
                        <button
                          key={source}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            setActiveSource(source);
                            setIsSourceMenuOpen(false);
                          }}
                          className={`flex h-[32px] w-full items-center px-[16px] py-[7px] text-left text-xs transition-colors hover:bg-[rgba(245,245,245,1)] ${
                            isSelected ? 'text-[#1476ff]' : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {source === ALL_SOURCES ? '全部来源' : sourceToLabel(source)}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <SearchInput
                wrapperClassName="w-full"
                aria-label={SKILL_SEARCH_ARIA_LABEL}
                value={searchQuery}
                onChange={(value) => setSearchQuery(value)}
                onClear={() => setSearchQuery('')}
                placeholder={SKILL_SEARCH_PLACEHOLDER}
                clearAriaLabel="清除搜索"
              />
            </div>
          </div>
        </div>
      </div>

      {skillItems.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center py-16">
          <EmptyDataState />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="hub-capability-scroll-region">
          {filteredDisplayedSkillItems.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredDisplayedSkillItems.map((item) => (
                <CapabilityCard
                  key={`${item.type}:${item.id}`}
                  item={item}
                  catFamilies={catFamilies}
                  toggling={toggling}
                  onToggle={handleToggle}
                  onUninstall={handleUninstall}
                  onClick={
                    item.type === 'skill'
                      ? () =>
                        onSelectSkill?.({
                          skillName: item.id,
                          avatarUrl: item.iconUrl ?? null,
                        })
                      : undefined
                  }
                  hideSkillMountStatus={hideSkillMountStatus}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-full items-center justify-center py-16">
              <NoSearchResultsState onClear={handleClearFilters} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
