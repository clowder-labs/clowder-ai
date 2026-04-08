'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { CenteredLoadingState } from './CenteredLoadingState';

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

function mountLabel(provider: string): string {
  if (provider === 'claude') return 'Claude';
  if (provider === 'codex') return 'Codex';
  if (provider === 'gemini') return 'Gemini';
  return provider;
}

function formatInstalledAt(value?: string): string {
  if (!value) return '未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)] px-4 py-3">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span className="text-sm font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function FileTreeBranch({ nodes, depth = 0 }: { nodes: SkillDetailFileTreeNode[]; depth?: number }) {
  return (
    <ul className="space-y-2">
      {nodes.map((node) => (
        <li key={node.path}>
          <div
            className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--text-secondary)]"
            style={{ paddingLeft: `${depth * 16 + 12}px` }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {node.type === 'directory' ? 'DIR' : 'FILE'}
            </span>
            <span className="font-medium text-[var(--text-primary)]">{node.name}</span>
            {typeof node.size === 'number' ? <span className="text-xs text-[var(--text-muted)]">{node.size} B</span> : null}
          </div>
          {node.children?.length ? <FileTreeBranch nodes={node.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

export function SkillDetailView({ skillName, onBack }: { skillName: string; onBack: () => void }) {
  const [detail, setDetail] = useState<SkillDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
  const mountLabelText = useMemo(() => {
    if (!detail?.mounts) return '暂无数据';
    return Object.entries(detail.mounts)
      .map(([provider, mounted]) => `${mountLabel(provider)}: ${mounted ? '已挂载' : '未挂载'}`)
      .join(' / ');
  }, [detail?.mounts]);
  const catsLabel = useMemo(() => {
    if (!detail) return '暂无数据';
    const enabledCats = Object.entries(detail.cats)
      .filter(([, enabled]) => enabled)
      .map(([catId]) => catId);
    return enabledCats.length > 0 ? enabledCats.join(', ') : '无';
  }, [detail]);

  if (loading) return <CenteredLoadingState />;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="skill-detail-panel">
      <div className="shrink-0 border-b border-[var(--border-default)] pb-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--text-accent)] hover:underline"
        >
          返回
        </button>
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <span>我的技能</span>
          <span>/</span>
          <span className="font-medium text-[var(--text-primary)]">{detail?.name ?? skillName}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-6">
        {error ? <p className="ui-status-error rounded-[var(--radius-md)] px-3 py-2 text-sm">{error}</p> : null}

        {detail ? (
          <div className="space-y-6">
            <section className="space-y-3">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-[var(--text-primary)]">{detail.name}</h2>
                <p className="text-sm leading-6 text-[var(--text-secondary)]">
                  {detail.description?.trim() || '暂未提供技能描述。'}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <DetailRow label="分类" value={detail.category?.trim() || '其他'} />
                <DetailRow label="来源" value={sourceLabel(detail.source)} />
                <DetailRow label="状态" value={statusLabel(detail.enabled)} />
                <DetailRow label="触发词" value={triggerLabel} />
                <DetailRow label="安装时间" value={formatInstalledAt(detail.installedAt)} />
                <DetailRow label="启用猫咪" value={catsLabel} />
              </div>
            </section>

            <section className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-card)] p-5">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">挂载状态</h3>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">{mountLabelText}</p>
            </section>

            <section className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-card)] p-5">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">文件结构</h3>
              {detail.fileTree?.length ? (
                <FileTreeBranch nodes={detail.fileTree} />
              ) : (
                <p className="text-sm text-[var(--text-muted)]">暂无文件结构数据。</p>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
