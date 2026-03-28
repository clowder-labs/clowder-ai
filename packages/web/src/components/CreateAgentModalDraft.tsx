'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { buildCatPayload } from './hub-cat-editor.payload';
import type { ClientValue, HubCatEditorDraft, HubCatEditorFormState } from './hub-cat-editor.model';
import type { ProfileItem, ProviderProfilesResponse } from './hub-provider-profiles.types';
import { DRAFT_MODEL_OPTIONS, ModelSelectDropdownDraft, type DraftModelOption } from './ModelSelectDropdownDraft';

interface CreateAgentModalDraftProps {
  open: boolean;
  name?: string;
  description?: string;
  selectedModelId?: string | null;
  models?: DraftModelOption[];
  draft?: HubCatEditorDraft | null;
  title?: string;
  onClose?: () => void;
  onSaved?: () => Promise<void> | void;
}

interface CreateModelOption extends DraftModelOption {
  profileId?: string;
  client: ClientValue;
  model: string;
  authType?: string;
  providerName?: string;
}

function CloseIcon() {
  return (
    <svg className="h-6 w-6 text-[#8D97A6]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="h-[18px] w-[18px] text-[#8D97A6]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 10.5L12 7L15.5 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6 17.5V18C6 18.55 6.45 19 7 19H17C17.55 19 18 18.55 18 18V17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-5 w-5 text-[#8D97A6]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function autoSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, '')
    .slice(0, 40);
}

function resolveProfileClient(profile: ProfileItem): ClientValue | null {
  if (profile.client) return profile.client;
  if (profile.oauthLikeClient === 'dare' || profile.oauthLikeClient === 'opencode') return profile.oauthLikeClient;

  const normalized = `${profile.id} ${profile.provider ?? ''} ${profile.displayName} ${profile.name}`.toLowerCase();
  if (normalized.includes('claude')) return 'anthropic';
  if (normalized.includes('codex')) return 'openai';
  if (normalized.includes('gemini')) return 'google';
  if (normalized.includes('dare')) return 'dare';
  if (normalized.includes('opencode')) return 'opencode';
  if (normalized.includes('jiuwen') || normalized.includes('relayclaw')) return 'relayclaw';

  switch (profile.protocol) {
    case 'anthropic':
      return 'anthropic';
    case 'openai':
      return 'openai';
    case 'google':
      return 'google';
    default:
      return null;
  }
}

export function buildDefaultCreateForm(
  name: string,
  description: string,
  selectedModel: CreateModelOption | null,
): HubCatEditorFormState {
  const safeName = name.trim();
  const catId = autoSlug(safeName);
  return {
    catId,
    name: safeName,
    displayName: safeName,
    nickname: '',
    avatar: '',
    colorPrimary: '#9B7EBD',
    colorSecondary: '#E8DFF5',
    mentionPatterns: catId ? `@${catId}` : '',
    roleDescription: description.trim() || '通用智能体助手',
    personality: '',
    teamStrengths: '',
    caution: '',
    strengths: '',
    client: selectedModel?.client ?? 'anthropic',
    accountRef: selectedModel?.profileId ?? '',
    defaultModel: selectedModel?.model ?? '',
    commandArgs: '',
    cliConfigArgs: [],
    ocProviderName:
      selectedModel?.client === 'opencode' && selectedModel.authType === 'api_key'
        ? selectedModel.providerName ?? ''
        : '',
    sessionChain: 'true',
    maxPromptTokens: '',
    maxContextTokens: '',
    maxMessages: '',
    maxContentLengthPerMsg: '',
  };
}

export function CreateAgentModalDraft({
  open,
  name = 'BOT',
  description = '',
  selectedModelId = null,
  models = DRAFT_MODEL_OPTIONS,
  draft = null,
  title = '创建智能体',
  onClose,
  onSaved,
}: CreateAgentModalDraftProps) {
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description);
  const [draftModelId, setDraftModelId] = useState<string | null>(selectedModelId);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<CreateModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftName(name);
    setDraftDescription(description);
    setDraftModelId(
      selectedModelId ?? (draft?.accountRef && draft?.defaultModel ? `${draft.accountRef}::${draft.defaultModel}` : null),
    );
    setModelMenuOpen(false);
    setError(null);
  }, [description, draft, name, open, selectedModelId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingModels(true);

    apiFetch('/api/provider-profiles')
      .then(async (res) => {
        if (!res.ok) throw new Error(`模型配置加载失败 (${res.status})`);
        return (await res.json()) as ProviderProfilesResponse;
      })
      .then((body) => {
        if (cancelled) return;
        const nextModels = body.providers.flatMap((profile) => {
          const client = resolveProfileClient(profile);
          if (!client) return [];
          const modelNames = profile.models?.filter((value) => value.trim().length > 0) ?? [];
          return modelNames.map<CreateModelOption>((modelName) => ({
            id: `${profile.id}::${modelName}`,
            name: modelName,
            profileId: profile.id,
            client,
            model: modelName,
            authType: profile.authType,
            providerName: profile.provider,
            statusText: profile.hasApiKey || profile.authType !== 'api_key' ? '已开通' : '未配置',
          }));
        });
        setAvailableModels(nextModels);
        setDraftModelId((current) => current ?? nextModels[0]?.id ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        const fallbackModels = models.map<CreateModelOption>((item) => ({
          ...item,
          client: 'dare',
          model: item.name,
          profileId: '',
          statusText: item.statusText ?? '已开通',
        }));
        setAvailableModels(fallbackModels);
        setDraftModelId((current) => current ?? fallbackModels[0]?.id ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false);
      });

    return () => {
      cancelled = true;
    };
  }, [models, open]);

  const selectedModel = useMemo(
    () => availableModels.find((item) => item.id === draftModelId) ?? availableModels[0] ?? null,
    [availableModels, draftModelId],
  );

  if (!open) return null;

  const handleSave = async () => {
    const trimmedName = draftName.trim();
    if (!trimmedName) {
      setError('请输入名称');
      return;
    }
    if (!selectedModel) {
      setError('请选择模型');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = buildCatPayload(buildDefaultCreateForm(trimmedName, draftDescription, selectedModel));
      const response = await apiFetch('/api/cats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        setError((body.error as string) ?? `创建失败 (${response.status})`);
        return;
      }
      await onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6 py-8">
      <div className="relative flex w-[860px] flex-col overflow-visible rounded-2xl bg-white shadow-[0_18px_42px_rgba(0,0,0,0.14)]">
        <div className="flex h-[72px] items-center justify-between border-b border-[#E9EDF3] px-6">
          <h2 className="text-[28px] font-bold text-[#20242B]">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 transition hover:bg-[#F5F7FA]">
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-col gap-[18px] px-6 pb-[22px] pt-5">
          <div className="space-y-2.5">
            <div className="text-sm font-semibold text-[#2D3643]">名称</div>
            <input
              aria-label="Name"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              className="h-[52px] w-full rounded-[10px] border border-[#D8DEE8] px-4 text-base text-[#2D3643] outline-none"
            />
          </div>

          <div className="space-y-2.5">
            <div className="text-sm font-semibold text-[#2D3643]">描述（可选）</div>
            <div className="rounded-[10px] border border-[#D8DEE8] bg-white px-4 py-3">
              <textarea
                aria-label="Description"
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                placeholder="请输入"
                maxLength={1000}
                className="h-[72px] w-full resize-none border-0 bg-transparent text-sm text-[#2D3643] outline-none placeholder:text-[#A4ADBA]"
              />
              <div className="text-right text-xs text-[#A4ADBA]">{draftDescription.length}/1000</div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="text-sm font-semibold text-[#2D3643]">图标</div>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#75B8FF] text-[28px] text-white">🤖</div>
              <button
                type="button"
                className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#D8DEE8] bg-white transition hover:bg-[#F8FAFC]"
              >
                <UploadIcon />
              </button>
            </div>
            <div className="text-xs text-[#8F98A7]">支持上传 png、jpeg、gif、jpg 格式图片，限制 200kb 内</div>
          </div>

          <div className="relative space-y-2.5">
            <div className="text-sm font-semibold text-[#2D3643]">模型</div>
            <button
              type="button"
              aria-label="Model"
              onClick={() => setModelMenuOpen((current) => !current)}
              className="flex h-12 w-full items-center justify-between rounded-[10px] border border-[#D8DEE8] bg-white px-[14px] text-left"
            >
              <span className="text-[15px] text-[#2D3643]">
                {loadingModels ? '加载模型中...' : (selectedModel?.name ?? '请选择模型')}
              </span>
              <ChevronDownIcon />
            </button>

            {modelMenuOpen ? (
              <div className="absolute left-0 top-[calc(100%+8px)] z-20">
                <ModelSelectDropdownDraft
                  items={availableModels}
                  selectedId={draftModelId}
                  onSelect={(item) => {
                    setDraftModelId(item.id);
                    setModelMenuOpen(false);
                  }}
                />
              </div>
            ) : null}
          </div>

          {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div> : null}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              aria-label="Cancel"
              onClick={onClose}
              className="h-[42px] min-w-[112px] rounded-full border border-[#C9D1DC] bg-white px-6 text-base font-medium text-[#2D3643] transition hover:bg-[#F8FAFC]"
            >
              取消
            </button>
            <button
              type="button"
              aria-label="Create"
              onClick={handleSave}
              disabled={saving}
              className="h-[42px] min-w-[112px] rounded-full bg-[#1E2430] px-6 text-base font-semibold text-white transition hover:bg-[#151A22] disabled:opacity-50"
            >
              {saving ? '创建中...' : '确定'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
