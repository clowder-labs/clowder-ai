'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { FeishuQrPanel } from './FeishuQrPanel';
import {
  DEFAULT_VISUAL,
  ExternalLinkIcon,
  LockIcon,
  PLATFORM_VISUALS,
  StepBadge,
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

interface ConnectorTestResult {
  ok?: boolean;
  message?: string;
  error?: string;
  details?: string;
  warnings?: string[];
  bot?: {
    openId?: string | null;
    name?: string | null;
  };
}

const QR_ONLY_PLATFORM_IDS = new Set(['feishu', 'weixin']);

function readStepText(step: unknown): string | null {
  if (typeof step === 'string') {
    const trimmed = step.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!step || typeof step !== 'object') return null;
  const candidate =
    (step as { text?: unknown; title?: unknown; label?: unknown }).text ??
    (step as { text?: unknown; title?: unknown; label?: unknown }).title ??
    (step as { text?: unknown; title?: unknown; label?: unknown }).label;
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
    return [
      {
        envName,
        label,
        sensitive: Boolean(current.sensitive),
        currentValue,
      },
    ];
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
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
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

  useEffect(() => {
    if (platforms.length === 0) {
      setSelectedPlatformId(null);
      return;
    }
    setSelectedPlatformId((prev) => {
      if (prev && platforms.some((platform) => platform.id === prev)) return prev;
      return platforms[0]?.id ?? null;
    });
  }, [platforms]);

  const handleSelect = (platformId: string) => {
    setSelectedPlatformId(platformId);
    setFieldValues({});
    setSaveResult(null);
  };

  const handleSave = async (platform: PlatformStatus) => {
    const updates = platform.fields
      .filter((f) => fieldValues[f.envName] !== undefined && fieldValues[f.envName] !== '')
      .map((f) => ({ name: f.envName, value: fieldValues[f.envName] }));

    if (updates.length === 0) {
      setSaveResult({ type: 'error', message: '请至少填写一项配置' });
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
      const data = await res.json().catch(() => ({}));
      const runtime = data?.runtime as
        | {
            applied?: boolean;
            failedConnectors?: Array<{ connectorId?: string; message?: string }>;
          }
        | undefined;
      const failedConnectors = Array.isArray(runtime?.failedConnectors) ? runtime.failedConnectors : [];
      setSaveResult({
        type: 'success',
        message:
          runtime && runtime.applied === false
            ? `配置已保存，但热生效失败：${failedConnectors
                .map((item) => item.connectorId || 'unknown')
                .join('、')}。请查看 API 日志。`
            : '配置已保存并立即生效。',
      });
      setFieldValues({});
      await fetchStatus();
    } catch {
      setSaveResult({ type: 'error', message: '网络错误' });
    } finally {
      setSaving(false);
    }
  };

  const TESTABLE_PLATFORMS = ['dingtalk', 'xiaoyi'];

  const handleTestConnection = async (platform: PlatformStatus) => {
    if (!TESTABLE_PLATFORMS.includes(platform.id)) {
      setSaveResult({ type: 'success', message: '该平台测试连接功能即将上线' });
      return;
    }

    setTesting(true);
    setSaveResult(null);
    try {
      const payload = Object.fromEntries(
        platform.fields
          .map((field) => [field.envName, fieldValues[field.envName]])
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0),
      );
      const res = await apiFetch(`/api/connector/test/${platform.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as ConnectorTestResult;
      if (!res.ok || !data.ok) {
        const pieces = [data.error ?? '测试失败', data.details].filter(Boolean);
        setSaveResult({ type: 'error', message: pieces.join('：') });
        return;
      }

      const warnings = Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : [];
      const warningText = warnings.length > 0 ? `；${warnings.join('；')}` : '';
      // Feishu includes bot info in response
      const botSuffix = data.bot?.name?.trim() || data.bot?.openId?.trim();
      const botText = botSuffix ? ` 已识别 ${botSuffix}` : '';
      setSaveResult({
        type: 'success',
        message: `${data.message ?? '连接测试成功'}${botText}${warningText}`,
      });
    } catch {
      setSaveResult({ type: 'error', message: '网络错误' });
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-[var(--text-muted)]">加载中...</p>;
  }

  if (platforms.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--text-muted)]">无法加载平台配置信息</p>;
  }

  const selectedPlatform = platforms.find((platform) => platform.id === selectedPlatformId) ?? platforms[0] ?? null;

  return (
    <div className="ui-panel flex h-full min-h-0 overflow-hidden">
      <div
        className="h-full w-[304px] shrink-0 space-y-2 overflow-y-auto border-r border-[var(--border-default)] px-4 py-6"
        data-testid="connector-left-pane"
      >
        {platforms.map((platform) => {
          const isSelected = selectedPlatform?.id === platform.id;
          const v = PLATFORM_VISUALS[platform.id] ?? DEFAULT_VISUAL;
          return (
            <button
              key={platform.id}
              type="button"
              onClick={() => handleSelect(platform.id)}
              data-testid={`platform-item-${platform.id}`}
              className="flex w-full items-center gap-3 border px-4 py-3.5 text-left transition-colors [border-radius:var(--connector-tab-radius)]"
              style={{
                borderColor: isSelected
                  ? 'var(--connector-tab-border-selected)'
                  : 'var(--connector-tab-border-default)',
                backgroundColor: isSelected ? 'var(--connector-tab-bg-selected)' : 'var(--connector-tab-bg-default)',
              }}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center">{v.icon}</span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-[14px] font-semibold text-[var(--text-primary)]">
                  {platform.name} {platform.nameEn !== platform.name ? platform.nameEn : ''}
                </span>
                <span
                  className={`ui-status-badge ${platform.configured ? 'ui-status-badge-configured' : 'ui-status-badge-unconfigured'}`}
                >
                  {platform.configured ? '已启用' : '未配置'}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="flex h-full min-w-0 flex-1 flex-col gap-6 overflow-auto px-12 py-6"
        data-testid="connector-right-pane"
      >
        <p className="text-[var(--text-primary)] font-semibold">配置</p>
        {selectedPlatform &&
          (() => {
            const platform = selectedPlatform;
            const guideSteps = platform.steps.slice(0, -1);
            const docsLink = parseDocsLink(platform.docsUrl);
            const saveStepNum = guideSteps.length + 2;

            return (
              <div className="space-y-3.5" data-testid={`platform-card-${platform.id}`}>
                {QR_ONLY_PLATFORM_IDS.has(platform.id) && (
                  <div className="space-y-3.5">
                    {platform.steps.map((step, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <StepBadge num={idx + 1} />
                          <span className="text-[14px]">{step}</span>
                        </div>
                        {idx === 0 && (
                          <div className="ml-[26px]">
                            {platform.id === 'feishu' ? (
                              <FeishuQrPanel
                                configured={platform.configured}
                                onConfirmed={() => void fetchStatus()}
                                onDisconnected={() => void fetchStatus()}
                              />
                            ) : (
                              <WeixinQrPanel configured={platform.configured} onConfigured={fetchStatus} />
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!QR_ONLY_PLATFORM_IDS.has(platform.id) && (
                  <div className="space-y-3.5">
                    {guideSteps.map((step, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <StepBadge num={idx + 1} />
                          <span className="text-[14px]">{step}</span>
                        </div>
                        {idx === 0 && docsLink && (
                          <a
                            href={docsLink.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ui-button-default ml-[26px] inline-flex items-center gap-1.5"
                          >
                            <ExternalLinkIcon />
                            <span>
                              {docsLink.hostname} {'->'} 查看官方文档
                            </span>
                          </a>
                        )}
                      </div>
                    ))}

                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <StepBadge num={guideSteps.length + 1} />
                        <span className="text-[14px]">填写应用凭证</span>
                      </div>
                      <div className="ml-[26px] space-y-2.5">
                        {platform.fields.map((field) => (
                          <div key={field.envName} className="w-[60%]">
                            <label htmlFor={`config-${field.envName}`} className="mb-1 block text-sm">
                              {field.label}
                              {field.sensitive && (
                                <span className="ml-1 inline-flex align-middle text-[var(--state-warning-text)]">
                                  <LockIcon />
                                </span>
                              )}
                            </label>
                            <input
                              id={`config-${field.envName}`}
                              type={field.sensitive ? 'password' : 'text'}
                              placeholder={
                                field.sensitive
                                  ? field.currentValue
                                    ? '已设置（输入新值覆盖）'
                                    : '未设置'
                                  : (field.currentValue ?? '未设置')
                              }
                              value={fieldValues[field.envName] ?? ''}
                              onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.envName]: e.target.value }))}
                              autoComplete={field.sensitive ? 'off' : undefined}
                              className="ui-input h-9 w-full px-3 text-[13px]"
                              data-testid={`field-${field.envName}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <StepBadge num={saveStepNum} />
                        <span className="text-[14px]">测试连接并保存</span>
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
                          className="ui-button-default inline-flex items-center gap-1.5"
                          onClick={() => void handleTestConnection(platform)}
                          disabled={testing}
                        >
                          <WifiIcon />
                          {testing ? '测试中...' : '测试连接'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSave(platform)}
                          disabled={saving}
                          className="ui-button-primary disabled:opacity-50"
                          data-testid={`save-${platform.id}`}
                        >
                          {saving ? '保存中...' : '保存配置'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
      </div>
    </div>
  );
}
