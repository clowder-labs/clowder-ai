'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { CenteredLoadingState } from './CenteredLoadingState';
import { SkillAvatar } from './SkillAvatar';

interface SkillDetailFileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: SkillDetailFileTreeNode[];
}

interface SkillDetailResponse {
  id: string;
  name: string;
  description?: string;
  triggers?: string[];
  category?: string;
  source: 'cat-cafe' | 'external';
  enabled: boolean;
  installedAt?: string;
  mounts?: Record<string, boolean>;
  fileTree?: SkillDetailFileTreeNode[];
  cats: Record<string, boolean>;
}

function sourceLabel(source: SkillDetailResponse['source']): string {
  return source === 'cat-cafe' ? '官方' : '三方';
}

function statusLabel(value: boolean): string {
  return value ? '已启用' : '已停用';
}

function formatInstalledAt(value?: string): string {
  if (!value) return '未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function findFirstFile(nodes: SkillDetailFileTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.type === 'file') return node.path;
    if (node.children?.length) {
      const nestedPath = findFirstFile(node.children);
      if (nestedPath) return nestedPath;
    }
  }
  return null;
}

function BasicInfoField({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`.trim()}>
      <p className="text-xs font-medium tracking-[0.02em] text-[var(--text-muted)]">{label}</p>
      <p className="text-sm leading-6 text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function FileTreeBranch({
  nodes,
  selectedPath,
  onSelect,
  depth = 0,
}: {
  nodes: SkillDetailFileTreeNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  depth?: number;
}) {
  return (
    <ul className="space-y-1.5">
      {nodes.map((node) => (
        <li key={node.path}>
          <button
            type="button"
            onClick={() => onSelect(node.path)}
            className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm transition ${
              selectedPath === node.path
                ? 'bg-[var(--surface-card-muted)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-card-muted)]/70'
            }`}
            style={{ paddingLeft: `${depth * 18 + 12}px` }}
          >
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border text-[10px] font-semibold uppercase ${
                selectedPath === node.path
                  ? 'border-[var(--border-strong)] bg-[var(--surface-panel)] text-[var(--text-primary)]'
                  : 'border-[var(--border-default)] bg-[var(--surface-panel)] text-[var(--text-muted)]'
              }`}
            >
              {node.type === 'directory' ? 'D' : 'F'}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
            {typeof node.size === 'number' ? <span className="shrink-0 text-xs text-[var(--text-muted)]">{node.size} B</span> : null}
          </button>
          {node.children?.length ? (
            <FileTreeBranch nodes={node.children} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function SkillDetailView({
  skillName,
  avatarUrl,
  onBack,
}: {
  skillName: string;
  avatarUrl?: string | null;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<SkillDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/skills/detail?name=${encodeURIComponent(skillName)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          setError(payload.error ?? `加载失败 (${res.status})`);
          setDetail(null);
          return;
        }
        const data = (await res.json()) as SkillDetailResponse;
        setDetail(data);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError('网络错误');
        setDetail(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadDetail();

    return () => controller.abort();
  }, [skillName]);

  const triggerLabel = useMemo(() => detail?.triggers?.join(', ') || '无', [detail?.triggers]);
  const catsLabel = useMemo(() => {
    if (!detail) return '暂无数据';
    const enabledCats = Object.entries(detail.cats)
      .filter(([, enabled]) => enabled)
      .map(([catId]) => catId);
    return enabledCats.length > 0 ? enabledCats.join(', ') : '无';
  }, [detail]);
  const categoryLabel = detail?.category?.trim() || '其他';
  const resolvedTitle = detail?.name ?? skillName;
  const resolvedDescription = detail?.description?.trim() || '暂未提供技能描述。';
  const selectedFileLabel = useMemo(() => {
    if (!selectedPath) return detail?.fileTree?.length ? '请选择文件' : '暂无文件';
    return selectedPath.split('/').filter(Boolean).at(-1) ?? selectedPath;
  }, [detail?.fileTree, selectedPath]);

  useEffect(() => {
    const fileTree = detail?.fileTree;
    if (!fileTree?.length) {
      setSelectedPath(null);
      return;
    }
    setSelectedPath((current) => current ?? findFirstFile(fileTree) ?? fileTree[0]?.path ?? null);
  }, [detail]);

  if (loading) return <CenteredLoadingState />;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="skill-detail-panel">
      <div className="shrink-0 pb-6">
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <button
            type="button"
            onClick={onBack}
            data-testid="skill-detail-breadcrumb-back"
            className="transition hover:underline"
          >
            我的技能
          </button>
          <span>/</span>
          <span className="font-medium text-[var(--text-primary)]">{resolvedTitle}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? <p className="ui-status-error mb-4 rounded-[var(--radius-md)] px-3 py-2 text-sm">{error}</p> : null}

        {detail ? (
          <div className="space-y-8 pb-6">
            <section className="space-y-5 border-b border-[var(--border-default)] pb-8">
              <div className="flex items-start gap-4">
                <SkillAvatar
                  avatarName={skillName}
                  avatarUrl={avatarUrl}
                  dataTestId="skill-detail-avatar"
                  className="h-[56px] w-[56px] rounded-[14px]"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[28px] font-semibold leading-[1.2] text-[var(--text-primary)]">{resolvedTitle}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span className="ui-badge-muted" data-testid="skill-detail-category-badge">
                      {categoryLabel}
                    </span>
                    <span className="text-[var(--text-muted)]">来源：{sourceLabel(detail.source)}</span>
                    <span className="text-[var(--text-muted)]">状态：{statusLabel(detail.enabled)}</span>
                  </div>
                </div>
              </div>
            </section>

            <section
              className="space-y-5"
              data-testid="skill-detail-basic-info"
            >
              <h3 className="text-base font-semibold text-[var(--text-primary)]">基础信息</h3>
              <div className="grid gap-x-8 gap-y-5 border-b border-[var(--border-default)] pb-6 md:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(0,2fr)]">
                <BasicInfoField label="名称" value={resolvedTitle} />
                <BasicInfoField label="更新时间" value={formatInstalledAt(detail.installedAt)} />
                <BasicInfoField label="描述" value={resolvedDescription} />
              </div>
              <div className="grid gap-x-8 gap-y-4 text-sm md:grid-cols-3">
                <BasicInfoField label="触发词" value={triggerLabel} />
                <BasicInfoField label="启用猫咪" value={catsLabel} />
                <BasicInfoField label="分类" value={categoryLabel} />
              </div>
            </section>

            <section className="space-y-3" data-testid="skill-detail-file-workspace">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">文件目录</h3>
              <div className="overflow-hidden rounded-[20px] border border-[var(--border-default)] bg-[var(--surface-card)]">
                <div className="flex min-h-[420px] flex-col md:flex-row">
                  <aside className="w-full shrink-0 border-b border-[var(--border-default)] bg-[var(--surface-panel)] md:w-[280px] md:border-b-0 md:border-r">
                    <div className="border-b border-[var(--border-default)] px-4 py-3 text-xs font-medium text-[var(--text-muted)]">File</div>
                    <div className="max-h-[420px] overflow-y-auto px-3 py-3">
                      {detail.fileTree?.length ? (
                        <FileTreeBranch nodes={detail.fileTree} selectedPath={selectedPath} onSelect={setSelectedPath} />
                      ) : (
                        <p className="px-2 py-4 text-sm text-[var(--text-muted)]">暂无文件结构数据。</p>
                      )}
                    </div>
                  </aside>
                  <div className="min-w-0 flex-1 bg-[var(--surface-card)]">
                    <div className="border-b border-[var(--border-default)] px-5 py-3 text-sm text-[var(--text-secondary)]">
                      {selectedFileLabel}
                    </div>
                    <div className="space-y-5 px-5 py-5">
                      <div className="space-y-2">
                        <h4 className="text-lg font-semibold text-[var(--text-primary)]">{resolvedTitle}</h4>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                          <span className="ui-badge-muted">{categoryLabel}</span>
                          <span>{sourceLabel(detail.source)}</span>
                          <span>{formatInstalledAt(detail.installedAt)}</span>
                        </div>
                      </div>
                      <div className="space-y-4 text-sm leading-7 text-[var(--text-secondary)]">
                        <p>{resolvedDescription}</p>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-[14px] border border-[var(--border-default)] bg-[var(--surface-panel)] px-4 py-3">
                            <p className="text-xs text-[var(--text-muted)]">触发词</p>
                            <p className="mt-1 text-sm text-[var(--text-primary)]">{triggerLabel}</p>
                          </div>
                          <div className="rounded-[14px] border border-[var(--border-default)] bg-[var(--surface-panel)] px-4 py-3">
                            <p className="text-xs text-[var(--text-muted)]">启用猫咪</p>
                            <p className="mt-1 text-sm text-[var(--text-primary)]">{catsLabel}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
