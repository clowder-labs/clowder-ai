'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import styles from './HubSkillsTab.module.css';

interface SearchSkill {
  id: string;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  stars?: number;
  repo: { githubOwner: string; githubRepoName: string };
  isInstalled: boolean;
}

interface SearchResult {
  skills: SearchSkill[];
  total: number;
  page: number;
  hasMore: boolean;
}

type InstallStatus = 'installing' | string;

const GENERAL_CATEGORY = '通用技能';
const INSTALLING_LABEL = '安装中...';
const INSTALL_FAILED_LABEL = '安装失败';
const INSTALL_LABEL = '安装';
const NO_RESULTS_LABEL = '未找到匹配的技能';
const FALLBACK_DESCRIPTION = '暂未提供技能描述。';
const INSTALLED_LABEL = '已安装';
const SEARCH_FAILED_LABEL = '搜索失败';
const NETWORK_ERROR_LABEL = '网络错误';
const SEARCH_PLACEHOLDER = '输入关键字搜索、过滤';
const SEARCH_ARIA_LABEL = '搜索 SkillHub 技能';
const LOADING_LABEL = '加载中...';
const SILL_SQUARE_LABEL = '技能广场';
const PAGE_LABEL_PREFIX = '第 ';
const PAGE_LABEL_SUFFIX = ' 页';
const LOAD_MORE_PREFIX = '加载更多（';
const LOAD_MORE_SUFFIX = '）';

function getSkillCategory(skill: SearchSkill): string {
  const primaryTag = skill.tags.find((tag) => tag.trim().length > 0);
  return primaryTag ? primaryTag.replace(/[-_]/g, ' ') : GENERAL_CATEGORY;
}

function getSkillInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [initial] = Array.from(trimmed);
  return /[a-z]/i.test(initial) ? initial.toUpperCase() : initial;
}

function SkillArtwork({ name }: { name: string }) {
  const initial = getSkillInitial(name);
  return (
    <div aria-hidden="true" className={styles.artwork}>
      <span className={styles.artworkInitial}>{initial}</span>
    </div>
  );
}

function InstallButton({
  slug,
  owner,
  repo,
  status,
  onInstall,
}: {
  slug: string;
  owner: string;
  repo: string;
  status: InstallStatus | undefined;
  onInstall: (owner: string, repo: string, skill: string) => void;
}) {
  if (status === 'installing') {
    return (
      <button type="button" disabled className={`${styles.installButton} ${styles.installButtonMuted}`}>
        {INSTALLING_LABEL}
      </button>
    );
  }
  return (
    <button type="button" onClick={() => onInstall(owner, repo, slug)} className={`${styles.installButton} ${styles.installButtonPrimary}`}>
      {INSTALL_LABEL}
    </button>
  );
}

function SkillList({
  results,
  installStatus,
  onInstall,
  onLoadMore,
  loadingMore,
  showPagination = true,
}: {
  results: SearchResult;
  installStatus: Map<string, InstallStatus>;
  onInstall: (owner: string, repo: string, skill: string) => void;
  onLoadMore: () => void;
  loadingMore: boolean;
  showPagination?: boolean;
}) {
  if (results.skills.length === 0) {
    return <p className="py-2 text-xs text-[var(--text-muted)]">{NO_RESULTS_LABEL}</p>;
  }

  return (
    <div className="space-y-4">
      <div className={styles.skillGrid}>
        {results.skills.map((skill) => {
          const resolvedDescription = skill.description.trim() || FALLBACK_DESCRIPTION;

          return (
            <article key={skill.id} className={styles.card}>
              <div className={styles.header}>
                <SkillArtwork name={skill.name} />
                <div className={styles.content}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className={`${styles.title} truncate`}>{skill.name}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 leading-[18px] text-[var(--text-secondary)] text-xs">
                        <span className="ui-badge-muted">{getSkillCategory(skill)}</span>
                        {skill.stars !== undefined ? (
                          <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
                            <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                              <path d="M6 1.2 7.55 4.3l3.45.5-2.5 2.45.6 3.45L6 9.1l-3.1 1.6.6-3.45L1 4.8l3.45-.5L6 1.2Z" />
                            </svg>
                            <span>{skill.stars}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <p className={styles.description} title={resolvedDescription}>
                {resolvedDescription}
              </p>

              <div className={styles.footer}>
                {!skill.isInstalled ? (
                  <div className="shrink-0">
                    <InstallButton
                      slug={skill.slug}
                      owner={skill.repo.githubOwner}
                      repo={skill.repo.githubRepoName}
                      status={installStatus.get(skill.slug)}
                      onInstall={onInstall}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled
                    className={`${styles.installButton} ${styles.installButtonSuccess} shrink-0`}
                  >
                    {INSTALLED_LABEL}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {results.hasMore && showPagination && (
        <button type="button" onClick={onLoadMore} disabled={loadingMore} className="ui-button-secondary mt-1 w-full disabled:opacity-50">
          {loadingMore ? LOADING_LABEL : `${LOAD_MORE_PREFIX}${PAGE_LABEL_PREFIX}${results.page + 1}${PAGE_LABEL_SUFFIX}${LOAD_MORE_SUFFIX}`}
        </button>
      )}
    </div>
  );
}

export function HubSkillsTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [trendingResults, setTrendingResults] = useState<SearchResult | null>(null);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [installStatus, setInstallStatus] = useState<Map<string, InstallStatus>>(new Map());
  const statusTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setInstallStatusWithTimer = useCallback((slug: string, status: InstallStatus) => {
    setInstallStatus((prev) => new Map(prev).set(slug, status));
    const existing = statusTimers.current.get(slug);
    if (existing) clearTimeout(existing);
    if (typeof status === 'string' && status !== 'installing') {
      const timer = setTimeout(() => {
        setInstallStatus((prev) => {
          const next = new Map(prev);
          next.delete(slug);
          return next;
        });
        statusTimers.current.delete(slug);
      }, 3000);
      statusTimers.current.set(slug, timer);
    }
  }, []);

  const clearInstallStatus = useCallback((slug: string) => {
    setInstallStatus((prev) => {
      const next = new Map(prev);
      next.delete(slug);
      return next;
    });
    const existing = statusTimers.current.get(slug);
    if (existing) {
      clearTimeout(existing);
      statusTimers.current.delete(slug);
    }
  }, []);

  const markSkillInstalled = useCallback((slug: string) => {
    const markInstalled = (result: SearchResult | null): SearchResult | null => {
      if (!result) return result;
      let changed = false;
      const skills = result.skills.map((item) => {
        if (item.slug !== slug || item.isInstalled) return item;
        changed = true;
        return { ...item, isInstalled: true };
      });
      return changed ? { ...result, skills } : result;
    };

    setSearchResults((prev) => markInstalled(prev));
    setTrendingResults((prev) => markInstalled(prev));
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const timers = statusTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  useEffect(() => {
    setTrendingLoading(true);
    apiFetch('/api/skills/trending')
      .then((res) => res.ok && res.json())
      .then((data) => data && setTrendingResults(data as SearchResult))
      .catch(() => {})
      .finally(() => setTrendingLoading(false));
  }, []);

  const executeSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }
    setSearchError(null);
    try {
      const res = await apiFetch(`/api/skills/search?q=${encodeURIComponent(query.trim())}&page=1&limit=20`);
      if (!res.ok) {
        setSearchError(SEARCH_FAILED_LABEL);
        return;
      }
      setSearchResults((await res.json()) as SearchResult);
    } catch {
      setSearchError(NETWORK_ERROR_LABEL);
    }
  }, []);

  const handleSearchInput = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (!value.trim()) {
        setSearchResults(null);
        setSearchError(null);
        return;
      }
      debounceTimer.current = setTimeout(() => executeSearch(value), 300);
    },
    [executeSearch],
  );

  const handleLoadMore = useCallback(async () => {
    if (!searchResults || !searchQuery.trim()) return;
    const nextPage = searchResults.page + 1;
    setLoadingMore(true);
    try {
      const res = await apiFetch(
        `/api/skills/search?q=${encodeURIComponent(searchQuery.trim())}&page=${nextPage}&limit=20`,
      );
      if (res.ok) {
        const data = (await res.json()) as SearchResult;
        setSearchResults({ ...data, skills: [...searchResults.skills, ...data.skills] });
      }
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [searchResults, searchQuery]);

  const handleInstall = useCallback(
    async (owner: string, repo: string, skill: string) => {
      setInstallStatusWithTimer(skill, 'installing');
      try {
        const res = await apiFetch('/api/skills/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner, repo, skill }),
        });
        if (res.ok) {
          clearInstallStatus(skill);
          markSkillInstalled(skill);
          showToast(`“${skill}” 安装成功`, 'success');
        } else {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          const detail = payload.error ?? `HTTP ${res.status}`;
          const message = `${INSTALL_FAILED_LABEL}：${detail}`;
          clearInstallStatus(skill);
          showToast(message, 'error');
        }
      } catch {
        clearInstallStatus(skill);
        showToast(`${INSTALL_FAILED_LABEL}：网络错误，请重试`, 'error');
      }
    },
    [clearInstallStatus, markSkillInstalled, setInstallStatusWithTimer, showToast],
  );

  const displayResults = searchResults ?? trendingResults;
  const displayPagination = searchResults !== null;

  return (
    <div className="space-y-[var(--space-9)]">
      {toast && (
        <div
          aria-live="polite"
          className={`rounded-[var(--radius-md)] px-3 py-2 text-xs font-medium ${
            toast.type === 'success' ? 'ui-status-success' : 'ui-status-error'
          }`}
        >
          {toast.message}
        </div>
      )}

      <section className="space-y-[var(--space-6)]">
        <div className="space-y-4">
          <p className="text-[20px] font-semibold">
            {SILL_SQUARE_LABEL}
            {displayResults ? ` (${displayResults.total})` : ''}
            {displayResults && displayPagination ? `，${PAGE_LABEL_PREFIX}${displayResults.page}${PAGE_LABEL_SUFFIX}` : ''}
          </p>
          <div className="flex flex-col gap-[var(--space-5)] sm:flex-row sm:items-center">
            <input
              type="text"
              aria-label={SEARCH_ARIA_LABEL}
              value={searchQuery}
              onChange={(event) => handleSearchInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void executeSearch(searchQuery)}
              placeholder={SEARCH_PLACEHOLDER}
              className="ui-field min-h-[var(--control-height-touch)] flex-1 px-4 py-2 text-sm sm:min-h-[var(--control-height-sm)]"
            />
          </div>
          {searchError && <p className="text-[11px] text-[var(--state-error-text)]">{searchError}</p>}
          {displayResults ? (
            <SkillList
              results={displayResults}
              installStatus={installStatus}
              onInstall={handleInstall}
              onLoadMore={displayPagination ? handleLoadMore : () => {}}
              loadingMore={displayPagination ? loadingMore : false}
              showPagination={displayPagination}
            />
          ) : trendingLoading ? (
            <p className="text-[11px] text-[var(--text-muted)]">{LOADING_LABEL}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
