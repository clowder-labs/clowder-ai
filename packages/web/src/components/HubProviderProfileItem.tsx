'use client';

import { useCallback, useState } from 'react';
import { parseProviderEnvText } from './hub-provider-env';
import type { ApiProtocol } from './hub-provider-profiles.sections';
import type { ProfileItem } from './hub-provider-profiles.types';
import { TagEditor } from './hub-tag-editor';
import { useConfirm } from './useConfirm';

export interface ProfileEditPayload {
  displayName: string;
  protocol?: string;
  baseUrl?: string;
  apiKey?: string;
  models?: string[];
  modelOverride?: string | null;
  command?: string;
  args?: string[];
  cwd?: string | null;
  env?: Record<string, string> | null;
  boundProviderRef?: string | null;
  defaultModel?: string | null;
}

interface HubProviderProfileItemProps {
  profile: ProfileItem;
  busy: boolean;
  bindableProviders?: ProfileItem[];
  onSave: (payload: ProfileEditPayload) => Promise<void>;
  onDelete: () => void;
  onTest?: () => Promise<void> | void;
}

function summaryText(profile: ProfileItem): string | null {
  if (profile.builtin) return null;
  if (profile.kind === 'acp') {
    const args = profile.args?.join(' ') ?? '';
    const cwd = profile.cwd ? ` · cwd=${profile.cwd}` : '';
    return `${profile.command ?? '(未设置)'} ${args}`.trim() + cwd;
  }
  const host = profile.baseUrl?.replace(/^https?:\/\//, '') ?? '(未设置)';
  return `${host} · ${profile.hasApiKey ? '已配置' : '未配置'}`;
}

function isEditableHttpProfile(profile: ProfileItem): boolean {
  return profile.kind !== 'acp' && !profile.builtin;
}

export function HubProviderProfileItem({
  profile,
  busy,
  bindableProviders = [],
  onSave,
  onDelete,
  onTest,
}: HubProviderProfileItemProps) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(profile.displayName);
  const [editProtocol, setEditProtocol] = useState<ApiProtocol>((profile.protocol as ApiProtocol) ?? 'anthropic');
  const [editBaseUrl, setEditBaseUrl] = useState(profile.baseUrl ?? '');
  const [editApiKey, setEditApiKey] = useState('');
  const [editModels, setEditModels] = useState<string[]>(profile.models ?? []);
  const [editCommand, setEditCommand] = useState(profile.command ?? '');
  const [editArgs, setEditArgs] = useState((profile.args ?? []).join(' '));
  const [editCwd, setEditCwd] = useState(profile.cwd ?? '');
  const [editEnvText, setEditEnvText] = useState('');
  const [editBoundProviderRef, setEditBoundProviderRef] = useState(profile.boundProviderRef ?? '');
  const [editDefaultModel, setEditDefaultModel] = useState(profile.defaultModel ?? '');

  const startEdit = useCallback(() => {
    setEditDisplayName(profile.displayName);
    setEditProtocol((profile.protocol as ApiProtocol) ?? 'anthropic');
    setEditBaseUrl(profile.baseUrl ?? '');
    setEditApiKey('');
    setEditModels(profile.models ?? []);
    setEditCommand(profile.command ?? '');
    setEditArgs((profile.args ?? []).join(' '));
    setEditCwd(profile.cwd ?? '');
    setEditEnvText('');
    setEditBoundProviderRef(profile.boundProviderRef ?? '');
    setEditDefaultModel(profile.defaultModel ?? '');
    setEditing(true);
  }, [
    profile.args,
    profile.baseUrl,
    profile.boundProviderRef,
    profile.command,
    profile.cwd,
    profile.defaultModel,
    profile.displayName,
    profile.models,
    profile.protocol,
  ]);

  const selectedBoundProvider = bindableProviders.find((item) => item.id === editBoundProviderRef) ?? null;
  const currentBoundProvider = bindableProviders.find((item) => item.id === profile.boundProviderRef) ?? null;
  const hasInvalidAcpBinding = Boolean(
    (editBoundProviderRef.trim() && !editDefaultModel.trim()) || (!editBoundProviderRef.trim() && editDefaultModel.trim()),
  );

  const handleBoundProviderChange = useCallback(
    (value: string) => {
      setEditBoundProviderRef(value);
      const nextModels = bindableProviders.find((item) => item.id === value)?.models ?? [];
      setEditDefaultModel((current) => (current && nextModels.includes(current) ? current : ''));
    },
    [bindableProviders],
  );

  const saveEdit = useCallback(async () => {
    if (profile.kind === 'acp') {
      const parsedEnv = parseProviderEnvText(editEnvText);
      if (hasInvalidAcpBinding) {
        return;
      }
      await onSave({
        displayName: editDisplayName.trim(),
        command: editCommand.trim(),
        args: editArgs
          .split(/\s+/)
          .map((value) => value.trim())
          .filter(Boolean),
        cwd: editCwd.trim() || null,
        ...(parsedEnv ? { env: parsedEnv } : {}),
        boundProviderRef: editBoundProviderRef.trim() || null,
        defaultModel: editBoundProviderRef.trim() ? editDefaultModel.trim() || null : null,
      });
    } else {
      await onSave({
        displayName: editDisplayName.trim(),
        ...(isEditableHttpProfile(profile)
          ? {
              protocol: editProtocol,
              baseUrl: editBaseUrl.trim(),
            }
          : {}),
        ...(editApiKey.trim() ? { apiKey: editApiKey.trim() } : {}),
        models: editModels,
      });
    }
    setEditing(false);
  }, [
    editApiKey,
    editArgs,
    editBaseUrl,
    editBoundProviderRef,
    editCommand,
    editCwd,
    editDefaultModel,
    editEnvText,
    editDisplayName,
    editModels,
    editProtocol,
    hasInvalidAcpBinding,
    onSave,
    profile.authType,
    profile.id,
    profile.kind,
  ]);

  if (editing) {
    return (
      <div className="space-y-3 rounded-2xl border border-[#E5EAF2] bg-[#F8FAFD] p-4">
        <div className="space-y-2">
          <input
            value={editDisplayName}
            onChange={(e) => setEditDisplayName(e.target.value)}
            placeholder="账号显示名"
            autoComplete="off"
            className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
          />
          {profile.kind === 'acp' ? (
            <>
              <input
                value={editCommand}
                onChange={(e) => setEditCommand(e.target.value)}
                placeholder="命令"
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
              />
              <textarea
                value={editArgs}
                onChange={(e) => setEditArgs(e.target.value)}
                rows={3}
                placeholder="参数按空格分隔"
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
              />
              <input
                value={editCwd}
                onChange={(e) => setEditCwd(e.target.value)}
                placeholder="可选 cwd"
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
              />
              <textarea
                value={editEnvText}
                onChange={(e) => setEditEnvText(e.target.value)}
                rows={3}
                placeholder="每行 KEY=value；留空保持现有值"
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
              />
              <select
                value={editBoundProviderRef}
                onChange={(e) => handleBoundProviderChange(e.target.value)}
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm"
              >
                <option value="">不绑定上游 Provider，Agent 自管</option>
                {bindableProviders.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.displayName}
                  </option>
                ))}
              </select>
              {selectedBoundProvider ? (
                <select
                  value={editDefaultModel}
                  onChange={(e) => setEditDefaultModel(e.target.value)}
                  className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm"
                >
                  <option value="">选择默认模型</option>
                  {(selectedBoundProvider.models ?? []).map((modelName) => (
                    <option key={modelName} value={modelName}>
                      {modelName}
                    </option>
                  ))}
                </select>
              ) : null}
            </>
          ) : isEditableHttpProfile(profile) ? (
            <>
              <select
                value={editProtocol}
                onChange={(e) => setEditProtocol(e.target.value as ApiProtocol)}
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm"
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google</option>
              </select>
              <input
                value={editBaseUrl}
                onChange={(e) => setEditBaseUrl(e.target.value)}
                placeholder="API 服务地址，如 https://api.example.com/v1"
                autoComplete="off"
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
              />
              <input
                type="password"
                autoComplete="off"
                value={editApiKey}
                onChange={(e) => setEditApiKey(e.target.value)}
                placeholder={profile.hasApiKey ? '已配置 sk-••••••••（留空保持不变）' : 'sk-xxxxxxxxxxxxxxxx'}
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
              />
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#6E7785]">可用模型</p>
                <TagEditor
                  tags={editModels}
                  tone="purple"
                  addLabel="+ 添加模型"
                  placeholder="输入模型名，如 gpt-4o"
                  emptyLabel="(至少添加 1 个模型)"
                  minCount={1}
                  onChange={setEditModels}
                />
              </div>
            </>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={saveEdit}
            disabled={busy || hasInvalidAcpBinding}
            className="rounded bg-[#111418] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2A3038] disabled:opacity-50"
          >
            {busy ? '保存中...' : '保存'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="rounded border border-[#D8DEE8] px-3 py-1.5 text-xs text-[#647083] hover:bg-[#F5F7FB]"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#E5EAF2] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-[#2D3545]">{profile.displayName}</span>
            {profile.builtin ? (
              <span className="text-[11px] font-semibold text-[#7A8495] flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                  />
                </svg>
                内置
              </span>
            ) : null}
            {!profile.builtin ? (
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  profile.kind === 'acp' ? 'bg-[#E8EEFF] text-[#4E63A6]' : 'bg-[#EEF3FF] text-[#5970B6]'
                }`}
              >
                {profile.kind === 'acp' ? 'acp' : 'api_key'}
              </span>
            ) : null}
          </div>
          {summaryText(profile) ? <p className="text-sm text-[#727D8F]">{summaryText(profile)}</p> : null}
          {profile.kind === 'acp' ? (
            <div className="space-y-1 text-xs leading-5 text-[#727D8F]">
              <p>模型接入: {profile.boundProviderRef ? `绑定 ${currentBoundProvider?.displayName ?? profile.boundProviderRef}` : 'Agent 自管'}</p>
              {profile.boundProviderRef && profile.defaultModel ? <p>默认模型: {profile.defaultModel}</p> : null}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#6E7785]">可用模型</p>
              <TagEditor
                tags={profile.models ?? []}
                tone={profile.builtin ? 'orange' : 'purple'}
                addLabel="+ 添加"
                placeholder="输入模型名"
                emptyLabel="(暂无模型)"
                minCount={1}
                onChange={(nextModels) => {
                  if (busy) return;
                  void onSave({
                    displayName: profile.displayName,
                    ...(profile.authType === 'api_key' ? { baseUrl: profile.baseUrl ?? '' } : {}),
                    models: nextModels,
                  });
                }}
              />
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {!profile.builtin ? (
            <button
              type="button"
              className="rounded-full border border-[#D9DFEA] bg-[#F8FAFD] px-3 py-1.5 text-xs font-semibold text-[#697487]"
              onClick={startEdit}
              disabled={busy}
            >
              编辑
            </button>
          ) : null}
          {!profile.builtin && onTest ? (
            <button
              type="button"
              className="rounded-full border border-[#CDEAD4] bg-[#EDF9F1] px-3 py-1.5 text-xs font-semibold text-[#2F8A4A]"
              onClick={() => void onTest()}
              disabled={busy}
            >
              测试
            </button>
          ) : null}
          {!profile.builtin ? (
            <button
              type="button"
              className="rounded-full border border-[#F8D1D1] bg-[#FFF3F3] px-3 py-1.5 text-xs font-semibold text-[#D14646]"
              onClick={async () => {
                if (
                  await confirm({
                    title: '删除确认',
                    message: `确认删除账号「${profile.displayName}」吗？该操作不可撤销。`,
                    variant: 'danger',
                    confirmLabel: '删除',
                  })
                ) {
                  onDelete();
                }
              }}
              disabled={busy}
            >
              删除
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
