'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { UploadSkillModal } from './UploadSkillModal';

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

type InstallStatus = 'installing' | 'success' | string;

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
      <button
        type="button"
        disabled
        className="rounded-[var(--radius-xs)] border border-[var(--border-default)] bg-[var(--surface-card-muted)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)]"
      >
        安装中...
      </button>
    );
  }
  if (status === 'success') {
    return (
      <button
        type="button"
        disabled
        className="ui-status-success rounded-[var(--radius-xs)] px-2 py-1 text-[10px] font-medium"
      >
        安装成功
      </button>
    );
  }
  if (typeof status === 'string' && status !== 'installing' && status !== 'success') {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <button
          type="button"
          onClick={() => onInstall(owner, repo, slug)}
          className="ui-status-error rounded-[var(--radius-xs)] px-2 py-1 text-[10px] font-medium"
        >
          安装失败
        </button>
        <span className="max-w-[180px] text-right text-[9px] leading-tight text-[var(--state-error-text)]">{status}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onInstall(owner, repo, slug)}
      className="rounded-[var(--radius-xs)] border border-[var(--border-accent)] bg-[var(--accent-soft)] px-2 py-1 text-[10px] font-medium text-[var(--text-accent)] transition-colors hover:bg-[var(--accent-soft-strong)]"
    >
      安装
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
    return <p className="py-2 text-xs text-[var(--text-muted)]">未找到匹配的 skill</p>;
  }

  return (
    <div>
      <p className="mb-2 text-[10px] text-[var(--text-muted)]">
        共 {results.total} 条{showPagination ? `，第 ${results.page} 页` : ''}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {results.skills.map((skill) => (
          <div key={skill.id} className="ui-card flex items-center justify-between px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <code className="font-mono text-[11px] font-semibold text-[var(--text-accent)]">{skill.name}</code>
                {skill.stars !== undefined && <span className="text-[10px] text-[var(--text-muted)]">{skill.stars}</span>}
                {skill.isInstalled && (
                  <span className="ui-status-success rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[10px] font-medium">
                    已安装
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">{skill.description}</p>
            </div>
            <div className="ml-3 shrink-0">
              {skill.isInstalled ? (
                <span className="text-[10px] text-[var(--text-muted)]">-</span>
              ) : (
                <InstallButton
                  slug={skill.slug}
                  owner={skill.repo.githubOwner}
                  repo={skill.repo.githubRepoName}
                  status={installStatus.get(skill.slug)}
                  onInstall={onInstall}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      {results.hasMore && showPagination && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="ui-button-secondary mt-3 w-full disabled:opacity-50"
        >
          {loadingMore ? '加载中...' : `加载更多（第 ${results.page + 1} 页）`}
        </button>
      )}
    </div>
  );
}

export function HubSkillsTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [trendingResults, setTrendingResults] = useState<SearchResult | null>(null);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [installStatus, setInstallStatus] = useState<Map<string, InstallStatus>>(new Map());
  const statusTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setInstallStatusWithTimer = useCallback((slug: string, status: InstallStatus) => {
    setInstallStatus((prev) => new Map(prev).set(slug, status));
    const existing = statusTimers.current.get(slug);
    if (existing) clearTimeout(existing);
    if (typeof status === 'string' && status !== 'installing' && status !== 'success') {
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
    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await apiFetch(`/api/skills/search?q=${encodeURIComponent(query.trim())}&page=1&limit=20`);
      if (!res.ok) {
        setSearchError('搜索失败');
        return;
      }
      setSearchResults((await res.json()) as SearchResult);
    } catch {
      setSearchError('网络错误');
    } finally {
      setSearchLoading(false);
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
          setInstallStatusWithTimer(skill, 'success');
          showToast(`“${skill}” 安装成功`, 'success');
        } else {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          const msg = payload.error ?? `安装失败 (${res.status})`;
          setInstallStatusWithTimer(skill, msg);
          showToast(msg, 'error');
        }
      } catch {
        setInstallStatusWithTimer(skill, '网络错误，请重试');
        showToast('网络错误，安装失败', 'error');
      }
    },
    [setInstallStatusWithTimer, showToast],
  );

  return (
    <div className="space-y-4">
      {toast && (
        <div
          className={`rounded-[var(--radius-md)] px-3 py-2 text-xs font-medium ${
            toast.type === 'success' ? 'ui-status-success' : 'ui-status-error'
          }`}
        >
          {toast.message}
        </div>
      )}

      <UploadSkillModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onSuccess={() => {
          showToast('Skill 上传成功', 'success');
        }}
      />

      <section className="ui-card space-y-3 p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => handleSearchInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void executeSearch(searchQuery)}
            placeholder="搜索 SkillHub skill..."
            className="ui-field flex-1 px-3 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={() => void executeSearch(searchQuery)}
            disabled={searchLoading || !searchQuery.trim()}
            className="ui-button-primary shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {searchLoading ? '搜索中...' : '搜索'}
          </button>
          <button type="button" onClick={() => setShowUpload(true)} className="ui-button-secondary shrink-0">
            + 上传
          </button>
        </div>
        {searchError && <p className="text-[11px] text-[var(--state-error-text)]">{searchError}</p>}
        {searchResults && (
          <SkillList
            results={searchResults}
            installStatus={installStatus}
            onInstall={handleInstall}
            onLoadMore={handleLoadMore}
            loadingMore={loadingMore}
          />
        )}
      </section>

      <section className="ui-card p-3">
        <h3 className="mb-2 text-xs font-semibold text-[var(--text-primary)]">热门推荐</h3>
        {trendingLoading && <p className="text-[11px] text-[var(--text-muted)]">加载中...</p>}
        {trendingResults && (
          <SkillList
            results={trendingResults}
            installStatus={installStatus}
            onInstall={handleInstall}
            onLoadMore={() => {}}
            loadingMore={false}
            showPagination={false}
          />
        )}
      </section>
    </div>
  );
}
