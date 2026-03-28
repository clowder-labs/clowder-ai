'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import {
  ChevronDown,
  ChevronRight,
  DEFAULT_VISUAL,
  ExternalLinkIcon,
  LockIcon,
  PLATFORM_VISUALS,
  StatusDotConnected,
  StatusDotIdle,
  StepBadge,
  TriangleAlertIcon,
  WifiIcon,
} from './HubConfigIcons';
import { WeixinQrPanel } from './WeixinQrPanel';

interface PlatformFieldStatus {
  envName: string;
  label: string;
  sensitive: boolean;
  currentValue: string | null;
}

interface PlatformStatus {
  id: string;
  name: string;
  nameEn: string;
  configured: boolean;
  fields: PlatformFieldStatus[];
  docsUrl: string;
  steps: string[];
}

function readStepText(step: unknown): string | null {
  if (typeof step === 'string') {
    const trimmed = step.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!step || typeof step !== 'object') return null;
  const candidate = (step as { text?: unknown; title?: unknown; label?: unknown }).text
    ?? (step as { text?: unknown; title?: unknown; label?: unknown }).title
    ?? (step as { text?: unknown; title?: unknown; label?: unknown }).label;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePlatform(raw: unknown, index: number): PlatformStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const idRaw = item.id;
  const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : `platform-${index}`;
  const nameRaw = item.name;
  const name = typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : id;
  const nameEnRaw = item.nameEn;
  const nameEn = typeof nameEnRaw === 'string' && nameEnRaw.trim() ? nameEnRaw.trim() : name;
  const docsUrlRaw = item.docsUrl;
  const docsUrl = typeof docsUrlRaw === 'string' ? docsUrlRaw.trim() : '';
  const configured = Boolean(item.configured);

  const fieldsRaw = Array.isArray(item.fields) ? item.fields : [];
  const fields = fieldsRaw.flatMap((field) => {
    if (!field || typeof field !== 'object') return [];
    const current = field as Record<string, unknown>;
    const envNameRaw = current.envName;
    if (typeof envNameRaw !== 'string' || !envNameRaw.trim()) return [];
    const envName = envNameRaw.trim();
    const labelRaw = current.label;
    const label = typeof labelRaw === 'string' && labelRaw.trim() ? labelRaw.trim() : envName;
    const currentValueRaw = current.currentValue;
    const currentValue = typeof currentValueRaw === 'string' ? currentValueRaw : null;
    return [{
      envName,
      label,
      sensitive: Boolean(current.sensitive),
      currentValue,
    }];
  });

  const stepsRaw = Array.isArray(item.steps) ? item.steps : [];
  const steps = stepsRaw.flatMap((step) => {
    const normalized = readStepText(step);
    return normalized ? [normalized] : [];
  });

  return {
    id,
    name,
    nameEn,
    configured,
    fields,
    docsUrl,
    steps,
  };
}

function parseDocsLink(rawUrl: string): { href: string; hostname: string } | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return { href: url.toString(), hostname: url.hostname };
  } catch {
    return null;
  }
}

export function HubConnectorConfigTab() {
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/connector/status');
      if (!res.ok) return;
      const data = await res.json();
      const nextPlatforms = Array.isArray(data?.platforms)
        ? data.platforms
            .map((item: unknown, index: number) => normalizePlatform(item, index))
            .filter((item: unknown): item is PlatformStatus => item !== null)
        : [];
      setPlatforms(nextPlatforms);
    } catch {
      // fall through
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleExpand = (platformId: string) => {
    if (expandedId === platformId) {
      setExpandedId(null);
      setFieldValues({});
      setSaveResult(null);
      return;
    }
    setExpandedId(platformId);
    setFieldValues({});
    setSaveResult(null);
  };

  const handleSave = async (platform: PlatformStatus) => {
    // Sensitive fields must be set in .env manually — only non-sensitive can be patched
    const updates = platform.fields
      .filter((f) => !f.sensitive && fieldValues[f.envName] !== undefined)
      .map((f) => ({ name: f.envName, value: fieldValues[f.envName] }));

    if (updates.length === 0) {
      setSaveResult({ type: 'error', message: '请填写至少一个非敏感配置项（敏感字段需手动编辑 .env）' });
      return;
    }

    setSaving(true);
    setSaveResult(null);
    try {
      const res = await apiFetch('/api/config/env', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveResult({ type: 'error', message: data.error ?? '保存失败' });
        return;
      }
      setSaveResult({ type: 'success', message: '配置已保存。需重启 API 服务使连接器生效。' });
      setFieldValues({});
      await fetchStatus();
    } catch {
      setSaveResult({ type: 'error', message: '网络错误' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-[var(--text-muted)]">加载中...</p>;
  }

  if (platforms.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--text-muted)]">无法加载平台配置信息</p>;
  }

  return (
    <div className="space-y-3">
      {platforms.map((platform) => {
        const isExpanded = expandedId === platform.id;
        const v = PLATFORM_VISUALS[platform.id] ?? DEFAULT_VISUAL;
        const guideSteps = platform.steps.slice(0, -1);
        const docsLink = parseDocsLink(platform.docsUrl);
        const saveStepNum = Math.max(platform.steps.length, guideSteps.length + 1);

        return (
          <div key={platform.id} className="ui-card overflow-hidden" data-testid={`platform-card-${platform.id}`}>
            <button
              type="button"
              onClick={() => handleExpand(platform.id)}
              className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                isExpanded ? 'bg-[var(--surface-card-muted)]' : 'hover:bg-[var(--surface-card-muted)]'
              }`}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                style={{ backgroundColor: v.iconBg, color: v.iconColor }}
              >
                {v.icon}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-[15px] font-semibold text-[var(--text-primary)]">
                  {platform.name} {platform.nameEn !== platform.name ? platform.nameEn : ''}
                </span>
                <span
                  className={`flex items-center gap-1 text-xs ${
                    platform.configured ? 'text-[var(--state-success-text)]' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {platform.configured ? <StatusDotConnected /> : <StatusDotIdle />}
                  {platform.configured ? '已配置' : '未配置'}
                </span>
              </span>
              <span className="shrink-0 text-[var(--text-muted)]">{isExpanded ? <ChevronDown /> : <ChevronRight />}</span>
            </button>

            {isExpanded && platform.id === 'weixin' && (
              <div className="space-y-3.5 border-t border-[var(--border-soft)] px-4 py-4">
                {platform.steps.map((step, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <StepBadge num={idx + 1} />
                      <span className="text-[13px] font-medium text-[var(--text-primary)]">{step}</span>
                    </div>
                    {idx === 0 && (
                      <div className="ml-[26px]">
                        <WeixinQrPanel configured={platform.configured} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isExpanded && platform.id !== 'weixin' && (
              <div className="space-y-3.5 border-t border-[var(--border-soft)] px-4 py-4">
                {guideSteps.map((step, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <StepBadge num={idx + 1} />
                      <span className="text-[13px] font-medium text-[var(--text-primary)]">{step}</span>
                    </div>
                    {idx === 0 && (
                      docsLink && (
                        <a
                          href={docsLink.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ui-button-secondary ml-[26px] inline-flex items-center gap-1.5"
                        >
                          <ExternalLinkIcon />
                          <span>{docsLink.hostname} → 查看官方文档</span>
                        </a>
                      )
                    )}
                  </div>
                ))}

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <StepBadge num={guideSteps.length + 1} />
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">填写应用凭证</span>
                  </div>
                  <div className="ml-[26px] space-y-2.5">
                    {platform.fields.map((field) => (
                      <div key={field.envName}>
                        <label htmlFor={`config-${field.envName}`} className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                          {field.label}
                          {field.sensitive && (
                            <span className="ml-1 inline-flex align-middle text-[var(--state-warning-text)]">
                              <LockIcon />
                            </span>
                          )}
                        </label>
                        {field.sensitive ? (
                          <div className="ui-field flex h-9 w-full items-center px-3 text-[13px] text-[var(--text-muted)]">
                            {field.currentValue ?? '••••••••••••••••'}
                            <span className="ml-auto whitespace-nowrap text-[10px] text-[var(--state-warning-text)]">编辑 .env</span>
                          </div>
                        ) : (
                          <input
                            id={`config-${field.envName}`}
                            type="text"
                            placeholder={field.currentValue ?? '未设置'}
                            value={fieldValues[field.envName] ?? ''}
                            onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.envName]: e.target.value }))}
                            className=ui-field h-9 w-full px-3 text-[13px]"
                            data-testid={`field-${field.envName}`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <StepBadge num={saveStepNum} />
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">测试连接并保存</span>
                  </div>
                  {saveResult && (
                    <div
                      className={`ml-[26px] rounded-[var(--radius-md)] px-3 py-2 text-xs ${
                        saveResult.type === 'success' ? 'ui-status-success' : 'ui-status-error'
                      }`}
                      data-testid="save-result"
                    >
                      {saveResult.message}
                    </div>
                  )}
                  <div className="ml-[26px] flex items-center gap-2">
                    <button
                      type="button"
                      className="ui-button-secondary inline-flex items-center gap-1.5"
                      onClick={() => setSaveResult({ type: 'success', message: '连接测试功能即将上线' })}
                    >
                      <WifiIcon />
                      测试连接
                    </button>
                    {platform.fields.some((f) => !f.sensitive) ? (
                      <button
                        type="button"
                        onClick={() => handleSave(platform)}
                        disabled={saving}
                        className="ui-button-primary disabled:opacity-50"
                        data-testid={`save-${platform.id}`}
                      >
                        {saving ? '保存中...' : '保存配置'}
                      </button>
                    ) : (
                      <div className="ui-status-warning flex-1 rounded-[var(--radius-md)] px-3 py-2 text-xs">
                        <p className="flex items-center gap-1 font-medium">
                          <LockIcon /> 所有凭证为敏感字段，请手动配置：
                        </p>
                        <code className="mt-1 block rounded-[var(--radius-xs)] border border-[var(--border-default)] bg-[var(--surface-panel)] px-2 py-1 font-mono text-[11px] text-[var(--text-primary)] select-all">
                          {platform.fields.map((f) => `${f.envName}=your_value`).join('\n')}
                        </code>
                        <p className="mt-1 text-[11px]">写入 .env 文件后重启 API 服务生效</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="ui-status-warning flex items-center gap-2 rounded-[var(--radius-sm)] px-3.5 py-2.5 text-xs font-medium">
        <TriangleAlertIcon />
        <span>修改配置后需重启 API 生效</span>
      </div>
    </div>
  );
}
