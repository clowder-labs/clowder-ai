'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import type {
  CapabilityBoardItem,
  CapabilityBoardResponse,
  CatFamily,
  SkillHealthSummary,
  ToggleHandler,
} from './capability-board-ui';
import {
  CapabilitySection,
  SectionIconSkill,
  SkillHealthBanner,
  StatusDot,
} from './capability-board-ui';
import { CreateApiKeyProfileSection } from './hub-provider-profiles.sections';
import { getProjectPaths, projectDisplayName } from './ThreadSidebar/thread-utils';
import { useConfirm } from './useConfirm';
import { useProviderProfilesState } from './useProviderProfilesState';

const ALL_CATEGORY = '全部';
const UNCATEGORIZED = '未分类';

export function HubCapabilityTab({ hideSkillMountStatus }: { hideSkillMountStatus?: boolean }) {
  const [items, setItems] = useState<CapabilityBoardItem[]>([]);
  const [catFamilies, setCatFamilies] = useState<CatFamily[]>([]);
  const [skillHealth, setSkillHealth] = useState<SkillHealthSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY);
  const [toggling, setToggling] = useState<string | null>(null);

  const { providerCreateSectionProps } = useProviderProfilesState();
  const confirm = useConfirm();
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [resolvedProjectPath, setResolvedProjectPath] = useState<string>('');

  const threads = useChatStore((state) => state.threads);
  const knownProjects = useMemo(() => getProjectPaths(threads), [threads]);

  const fetchCapabilities = useCallback(async (forProject?: string) => {
    setError(null);
    try {
      const query = new URLSearchParams();
      if (forProject) query.set('projectPath', forProject);
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
      setResolvedProjectPath(data.projectPath);
      setSkillHealth(data.skillHealth ?? null);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCapabilities();
  }, [fetchCapabilities]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchCapabilities(projectPath ?? undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchCapabilities, projectPath]);

  const switchProject = useCallback(
    (path: string | null) => {
      setProjectPath(path);
      setLoading(true);
      void fetchCapabilities(path ?? undefined);
    },
    [fetchCapabilities],
  );

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
          projectPath: projectPath ?? undefined,
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
        await fetchCapabilities(projectPath ?? undefined);
      } catch {
        setError('网络错误');
      } finally {
        setToggling(null);
      }
    },
    [fetchCapabilities, projectPath],
  );

  const handleUninstall = useCallback(
    async (skillId: string) => {
      const ok = await confirm({
        title: '卸载 Skill',
        message: `确定要卸载 “${skillId}” 吗？此操作不可恢复。`,
        confirmLabel: '卸载',
        cancelLabel: '取消',
        variant: 'danger',
      });
      if (!ok) return;
      try {
        const res = await apiFetch('/api/skills/uninstall', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: skillId }),
        });
        if (res.ok) {
          await fetchCapabilities(projectPath ?? undefined);
        }
      } catch {
        // ignore
      }
    },
    [confirm, fetchCapabilities, projectPath],
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

  useEffect(() => {
    if (!categoryTabs.includes(activeCategory)) setActiveCategory(ALL_CATEGORY);
  }, [activeCategory, categoryTabs]);

  if (loading) return <p className="text-sm text-[var(--text-muted)]">加载中...</p>;

  return (
    <div className="space-y-4">
      {error && <p className="ui-status-error rounded-[var(--radius-md)] px-3 py-2 text-sm">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <ProjectSelector
            resolvedPath={resolvedProjectPath}
            knownProjects={knownProjects}
            currentSelection={projectPath}
            onSwitch={switchProject}
          />
        </div>
      </div>

      {skillHealth && <SkillHealthBanner health={skillHealth} items={items} />}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-4 border-b border-[var(--border-soft)] pb-2">
          {categoryTabs.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={`inline-flex min-h-7 items-center leading-none text-sm font-medium transition-colors ${
                activeCategory === category ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <CapabilitySection
        icon={<SectionIconSkill />}
        title={`${activeCategory} (${displayedSkillItems.length})`}
        subtitle="已安装技能"
        items={displayedSkillItems}
        catFamilies={catFamilies}
        toggling={toggling}
        onToggle={handleToggle}
        onUninstall={handleUninstall}
        hideSkillMountStatus={hideSkillMountStatus}
      />

      {skillItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-card-muted)]">
            <svg
              className="h-8 w-8 text-[var(--text-subtle)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">没有找到匹配的能力</h3>
          <p className="mt-1 max-w-[220px] text-xs text-[var(--text-muted)]">请检查 Skills 配置，或切换分类后重试。</p>
        </div>
      )}

      <div className="mt-4 border-t border-[var(--border-soft)] pt-4">
        <div className="flex items-center justify-end text-xs text-[var(--text-muted)]">
          <span className="flex gap-3">
            <span className="flex items-center gap-1.5">
              <StatusDot status="connected" /> {displayedSkillItems.filter((item) => item.connectionStatus === 'connected').length} 活跃
            </span>
            <span>
              Skill: <strong className="font-medium text-[var(--text-secondary)]">{displayedSkillItems.length}</strong>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function ProjectSelector({
  resolvedPath,
  knownProjects,
  currentSelection,
  onSwitch,
}: {
  resolvedPath: string;
  knownProjects: string[];
  currentSelection: string | null;
  onSwitch: (path: string | null) => void;
}) {
  const allPaths = useMemo(() => {
    const set = new Set<string>();
    set.add(resolvedPath);
    for (const path of knownProjects) set.add(path);
    return Array.from(set);
  }, [resolvedPath, knownProjects]);

  if (allPaths.length <= 1) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <span>项目:</span>
        <span className="font-medium text-[var(--text-secondary)]">{projectDisplayName(resolvedPath)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <label htmlFor="project-select" className="whitespace-nowrap text-[var(--text-muted)]">
        项目:
      </label>
      <select
        id="project-select"
        value={currentSelection ?? ''}
        onChange={(event) => onSwitch(event.target.value || null)}
        className="ui-field min-w-0 flex-1 px-2 py-1 text-xs"
      >
        <option value="">{projectDisplayName(resolvedPath)}</option>
        {allPaths
          .filter((path) => path !== resolvedPath || currentSelection !== null)
          .map((path) => (
            <option key={path} value={path}>
              {projectDisplayName(path)}
            </option>
          ))}
      </select>
    </div>
  );
}
