'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import {
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

function getDocsHost(url: string): string {
  if (!url) return '文档链接';
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function HubConnectorConfigTab() {
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/connector/status');
      if (!res.ok) return;
      const data = (await res.json()) as { platforms?: PlatformStatus[] };
      setPlatforms(data.platforms ?? []);
    } catch {
      // noop
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (platforms.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => (prev && platforms.some((p) => p.id === prev) ? prev : platforms[0]!.id));
  }, [platforms]);

  const selectedPlatform = useMemo(
    () => platforms.find((platform) => platform.id === selectedId) ?? null,
    [platforms, selectedId],
  );

  const handleSelect = (platformId: string) => {
    setSelectedId(platformId);
    setFieldValues({});
    setSaveResult(null);
  };

  const handleSave = async (platform: PlatformStatus) => {
    const updates = platform.fields
      .filter((f) => !f.sensitive && fieldValues[f.envName] !== undefined)
      .map((f) => ({ name: f.envName, value: fieldValues[f.envName] }));

    if (updates.length === 0) {
      setSaveResult({ type: 'error', message: '请至少填写一个非敏感配置项（敏感字段需手动编辑 .env）。' });
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
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        setSaveResult({ type: 'error', message: (data.error as string) ?? '保存失败' });
        return;
      }
      setSaveResult({ type: 'success', message: '配置已保存。需要重启 API 服务使连接器生效。' });
      setFieldValues({});
      await fetchStatus();
    } catch {
      setSaveResult({ type: 'error', message: '网络错误' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-gray-400">加载中...</p>;
  }

  if (platforms.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">无法加载平台配置信息</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-3" data-testid="connector-two-col-layout">
        <aside className="rounded-2xl border border-gray-200 bg-white p-2">
          <div className="space-y-1.5">
            {platforms.map((platform) => {
              const v = PLATFORM_VISUALS[platform.id] ?? DEFAULT_VISUAL;
              const isSelected = selectedId === platform.id;
              return (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => handleSelect(platform.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isSelected ? 'border-sky-300 bg-sky-50' : 'border-transparent hover:bg-gray-50'
                  }`}
                  data-testid={`platform-card-${platform.id}`}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                    style={{ backgroundColor: v.iconBg, color: v.iconColor }}
                  >
                    {v.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-gray-900">
                      {platform.name} {platform.nameEn !== platform.name ? platform.nameEn : ''}
                    </span>
                    <span
                      className={`flex items-center gap-1 text-xs ${platform.configured ? 'text-green-600' : 'text-gray-400'}`}
                    >
                      {platform.configured ? <StatusDotConnected /> : <StatusDotIdle />}
                      {platform.configured ? '已配置' : '未配置'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          {!selectedPlatform && <p className="py-8 text-center text-sm text-gray-400">请选择一个平台</p>}

          {selectedPlatform && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    {selectedPlatform.name}
                    {selectedPlatform.nameEn !== selectedPlatform.name ? ` (${selectedPlatform.nameEn})` : ''}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">平台配置与连接测试</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                    selectedPlatform.configured
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-gray-50 text-gray-500 border border-gray-200'
                  }`}
                >
                  {selectedPlatform.configured ? <StatusDotConnected /> : <StatusDotIdle />}
                  {selectedPlatform.configured ? '已配置' : '未配置'}
                </span>
              </div>

              {selectedPlatform.id === 'weixin' && (
                <div className="space-y-3.5">
                  {selectedPlatform.steps.map((step, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <StepBadge num={idx + 1} />
                        <span className="text-[13px] font-medium text-gray-900">{step}</span>
                      </div>
                      {idx === 0 && (
                        <div className="ml-[26px]">
                          <WeixinQrPanel configured={selectedPlatform.configured} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {selectedPlatform.id !== 'weixin' && (
                <div className="space-y-3.5">
                  {selectedPlatform.steps.slice(0, -1).map((step, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <StepBadge num={idx + 1} />
                        <span className="text-[13px] font-medium text-gray-900">{step}</span>
                      </div>
                      {idx === 0 && selectedPlatform.docsUrl && (
                        <a
                          href={selectedPlatform.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-[26px] flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-2 text-xs text-blue-600 transition-colors hover:bg-sky-100"
                        >
                          <ExternalLinkIcon />
                          <span>{getDocsHost(selectedPlatform.docsUrl)} · 查看官方文档</span>
                        </a>
                      )}
                    </div>
                  ))}

                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <StepBadge num={Math.max(selectedPlatform.steps.length, 1)} />
                      <span className="text-[13px] font-medium text-gray-900">填写应用凭证</span>
                    </div>
                    <div className="ml-[26px] space-y-2.5">
                      {selectedPlatform.fields.map((field) => (
                        <div key={field.envName}>
                          <label
                            htmlFor={`config-${field.envName}`}
                            className="mb-1 block text-xs font-medium text-gray-500"
                          >
                            {field.label}
                            {field.sensitive && (
                              <span className="ml-1 inline-flex align-middle text-amber-500">
                                <LockIcon />
                              </span>
                            )}
                          </label>
                          {field.sensitive ? (
                            <div className="flex h-9 w-full items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-[13px] text-gray-400">
                              {field.currentValue ?? '••••••••••••••••'}
                              <span className="ml-auto whitespace-nowrap text-[10px] text-amber-600">编辑 .env</span>
                            </div>
                          ) : (
                            <input
                              id={`config-${field.envName}`}
                              type="text"
                              placeholder={field.currentValue ?? '未设置'}
                              value={fieldValues[field.envName] ?? ''}
                              onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.envName]: e.target.value }))}
                              className="h-9 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 text-[13px] transition-colors focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                              data-testid={`field-${field.envName}`}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <StepBadge num={Math.max(selectedPlatform.steps.length + 1, 2)} />
                      <span className="text-[13px] font-medium text-gray-900">测试连接并保存</span>
                    </div>
                    {saveResult && (
                      <div
                        className={`ml-[26px] rounded-lg border px-3 py-2 text-xs ${
                          saveResult.type === 'success'
                            ? 'border-green-200 bg-green-50 text-green-700'
                            : 'border-red-200 bg-red-50 text-red-700'
                        }`}
                        data-testid="save-result"
                      >
                        {saveResult.message}
                      </div>
                    )}
                    <div className="ml-[26px] flex items-center gap-2">
                      <button
                        type="button"
                        className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        onClick={() => setSaveResult({ type: 'success', message: '连接测试功能即将上线' })}
                      >
                        <WifiIcon />
                        测试连接
                      </button>
                      {selectedPlatform.fields.some((f) => !f.sensitive) ? (
                        <button
                          type="button"
                          onClick={() => handleSave(selectedPlatform)}
                          disabled={saving}
                          className="rounded-lg bg-blue-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                          data-testid={`save-${selectedPlatform.id}`}
                        >
                          {saving ? '保存中...' : '保存配置'}
                        </button>
                      ) : (
                        <div className="flex-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                          <p className="flex items-center gap-1 font-medium">
                            <LockIcon /> 所有凭证为敏感字段，请手动配置：
                          </p>
                          <code className="mt-1 block select-all rounded bg-amber-100 px-2 py-1 font-mono text-[11px]">
                            {selectedPlatform.fields.map((f) => `${f.envName}=your_value`).join('\n')}
                          </code>
                          <p className="mt-1 text-[11px]">写入 .env 文件后重启 API 服务生效</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="flex items-center gap-2 rounded-[10px] border border-yellow-300 bg-amber-50 px-3.5 py-2.5">
        <TriangleAlertIcon />
        <span className="text-xs font-medium text-amber-800">修改配置后需重启 API 生效</span>
      </div>
    </div>
  );
}
