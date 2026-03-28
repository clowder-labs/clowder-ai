'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { CatData } from '@/hooks/useCatData';
import { apiFetch } from '@/utils/api-client';
import { uploadAvatarAsset } from './hub-cat-editor.client';
import { initialState, type ClientValue, type HubCatEditorDraft, type HubCatEditorFormState } from './hub-cat-editor.model';
import { buildCatPayload } from './hub-cat-editor.payload';
import {
  ModelSelectDropdownDraft,
  ModelSelectTriggerIcon,
  ModelSelectValueDraft,
  type DraftModelOption,
} from './ModelSelectDropdownDraft';
import type { ProfileItem, ProviderProfilesResponse } from './hub-provider-profiles.types';

interface MassModelResponseItem {
  id?: string | number;
  object?: string;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

interface CreateAgentModalDraftProps {
  open: boolean;
  cat?: CatData | null;
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

const MODEL_MENU_MAX_HEIGHT = 335;
const MODEL_MENU_OFFSET = 8;

function pickStringField(item: MassModelResponseItem, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const value = item[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function normalizeMassModelName(item: MassModelResponseItem): string {
  const nameFromKnownFields = pickStringField(item, ['name', 'modelName', 'model_name', 'displayName', 'display_name', '名称']);
  if (nameFromKnownFields) return nameFromKnownFields;

  const genericStringEntries = Object.entries(item).filter(
    ([key, value]) => typeof value === 'string' && key !== 'id' && key !== 'object',
  ) as Array<[string, string]>;
  return genericStringEntries.find(([key]) => !/desc|description|描述/i.test(key))?.[1]?.trim() ?? '';
}

function chooseProfileForModel(
  modelName: string,
  profiles: ProfileItem[],
  preferredProfileIds: string[],
  activeProfileId: string | null,
): ProfileItem | null {
  const matches = profiles.filter((profile) => (profile.models ?? []).includes(modelName));
  if (matches.length === 0) return null;

  for (const profileId of preferredProfileIds) {
    const matched = matches.find((profile) => profile.id === profileId);
    if (matched) return matched;
  }

  if (activeProfileId) {
    const activeMatch = matches.find((profile) => profile.id === activeProfileId);
    if (activeMatch) return activeMatch;
  }

  return matches[0] ?? null;
}

function CloseIcon() {
  return (
    <svg className="h-6 w-6 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg className="h-[18px] w-[18px] text-[var(--text-accent)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3L13.6 7.4L18 9L13.6 10.6L12 15L10.4 10.6L6 9L10.4 7.4L12 3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M18.5 4.5L19 6L20.5 6.5L19 7L18.5 8.5L18 7L16.5 6.5L18 6L18.5 4.5Z" fill="currentColor" />
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

function inferClientFromModelName(modelName: string): ClientValue {
  const normalized = modelName.toLowerCase();
  if (normalized.includes('claude')) return 'anthropic';
  if (normalized.includes('gpt')) return 'openai';
  if (normalized.includes('gemini')) return 'google';
  if (normalized.includes('qwen') || normalized.includes('deepseek') || normalized.includes('glm') || normalized.includes('kimi')) {
    return 'dare';
  }
  return 'dare';
}

function avatarSeed(name: string): string {
  const normalized = name.trim() || 'BOT';
  let hash = 0;
  for (const char of normalized) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return `hsl(${hash} 72% 62%)`;
}

function buildGeneratedAvatarDataUrl(name: string): string {
  const label = (name.trim().slice(0, 1) || '智').toUpperCase();
  const color = avatarSeed(name);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${color}" />
          <stop offset="100%" stop-color="#8AA4FF" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="48" fill="url(#g)" />
      <circle cx="48" cy="48" r="38" fill="rgba(255,255,255,0.18)" />
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="700" fill="#FFFFFF">${label}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function resolveInitialAvatar(cat: CatData | null): string {
  return cat?.avatar?.trim() ?? '';
}

export function buildDefaultCreateForm(
  name: string,
  description: string,
  avatar: string,
  selectedModel: CreateModelOption | null,
): HubCatEditorFormState {
  const safeName = name.trim();
  const catId = autoSlug(safeName);
  return {
    catId,
    name: safeName,
    displayName: safeName,
    nickname: '',
    avatar,
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

function buildEditForm(
  cat: CatData,
  name: string,
  description: string,
  avatar: string,
  selectedModel: CreateModelOption | null,
): HubCatEditorFormState {
  const base = initialState(cat, null);
  const safeName = name.trim() || cat.name || cat.displayName;
  return {
    ...base,
    name: safeName,
    displayName: safeName,
    avatar,
    roleDescription: description.trim() || base.roleDescription,
    client: selectedModel?.client ?? base.client,
    accountRef: selectedModel?.profileId ?? base.accountRef,
    defaultModel: selectedModel?.model ?? base.defaultModel,
    ocProviderName:
      selectedModel?.client === 'opencode' && selectedModel.authType === 'api_key'
        ? selectedModel.providerName ?? ''
        : '',
  };
}

function resolveInitialModelId(cat: CatData | null, draft: HubCatEditorDraft | null, selectedModelId: string | null): string | null {
  if (selectedModelId) {
    const [maybeProfileId, maybeModel] = selectedModelId.split('::');
    return maybeModel ?? maybeProfileId ?? null;
  }
  if (cat?.defaultModel) return cat.defaultModel;
  if (draft?.defaultModel) return draft.defaultModel;
  return null;
}

export function CreateAgentModalDraft({
  open,
  cat = null,
  name = 'BOT',
  description = '',
  selectedModelId = null,
  models: _models,
  draft = null,
  title,
  onClose,
  onSaved,
}: CreateAgentModalDraftProps) {
  const [draftName, setDraftName] = useState(name);
  const [draftDescription, setDraftDescription] = useState(description);
  const [draftAvatar, setDraftAvatar] = useState('');
  const [draftModelId, setDraftModelId] = useState<string | null>(selectedModelId);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const [availableModels, setAvailableModels] = useState<CreateModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftName(name || cat?.name || cat?.displayName || 'BOT');
    setDraftDescription(description || cat?.roleDescription || '');
    setDraftAvatar(resolveInitialAvatar(cat));
    setDraftModelId(resolveInitialModelId(cat, draft, selectedModelId));
    setModelMenuOpen(false);
    setOpenAbove(false);
    setError(null);
  }, [cat, description, draft, name, open, selectedModelId]);

  useLayoutEffect(() => {
    if (!modelMenuOpen || !modelTriggerRef.current) return;

    const rect = modelTriggerRef.current.getBoundingClientRect();
    const estimatedMenuHeight =
      modelMenuRef.current?.offsetHeight ?? Math.min(Math.max(availableModels.length, 1) * 34 + 52, MODEL_MENU_MAX_HEIGHT);
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenAbove(spaceBelow < estimatedMenuHeight + MODEL_MENU_OFFSET);
  }, [availableModels.length, modelMenuOpen]);

  useEffect(() => {
    if (!modelMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (modelMenuRef.current?.contains(target) || modelTriggerRef.current?.contains(target)) return;
      setModelMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setModelMenuOpen(false);
      modelTriggerRef.current?.focus();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [modelMenuOpen]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingModels(true);

    Promise.all([apiFetch('/api/mass-models'), apiFetch('/api/provider-profiles')])
      .then(async ([massModelsRes, profilesRes]) => {
        if (!massModelsRes.ok) throw new Error(`模型列表加载失败 (${massModelsRes.status})`);
        if (!profilesRes.ok) throw new Error(`模型配置加载失败 (${profilesRes.status})`);

        const massModelsBody = (await massModelsRes.json()) as { list?: MassModelResponseItem[]; models?: MassModelResponseItem[] };
        const profilesBody = (await profilesRes.json()) as ProviderProfilesResponse;
        if (cancelled) return;

        const source = Array.isArray(massModelsBody.list)
          ? massModelsBody.list
          : Array.isArray(massModelsBody.models)
            ? massModelsBody.models
            : [];
        const preferredProfileIds = [cat?.accountRef, draft?.accountRef].filter((value): value is string => Boolean(value));
        const uniqueModelNames = [
          ...new Set(
            [
              ...source.map(normalizeMassModelName),
              cat?.defaultModel ?? '',
              draft?.defaultModel ?? '',
            ].filter((value) => value.length > 0),
          ),
        ];

        const nextModels = uniqueModelNames.map<CreateModelOption>((modelName) => {
          const profile = chooseProfileForModel(modelName, profilesBody.providers, preferredProfileIds, profilesBody.activeProfileId);
          const resolvedClient = profile ? resolveProfileClient(profile) : null;

          return {
            id: modelName,
            name: modelName,
            profileId: profile?.id ?? '',
            client: resolvedClient ?? inferClientFromModelName(modelName),
            model: modelName,
            authType: profile?.authType,
            providerName: profile?.provider,
            providerGroup: profile?.displayName || profile?.name || profile?.provider || undefined,
            statusText: profile ? (profile.hasApiKey || profile.authType !== 'api_key' ? '已开通' : '未配置') : undefined,
            rightLabel: modelName.toLowerCase().includes('deepseek-v3.2') ? '工具' : undefined,
          };
        });

        setAvailableModels(nextModels);
        setDraftModelId((current) => current ?? nextModels[0]?.id ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setAvailableModels([]);
        setError(err instanceof Error ? err.message : '模型列表加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, cat?.accountRef, cat?.defaultModel, draft?.accountRef, draft?.defaultModel]);

  const selectedModel = useMemo(
    () => availableModels.find((item) => item.id === draftModelId) ?? availableModels[0] ?? null,
    [availableModels, draftModelId],
  );

  const modalTitle = title ?? (cat ? '编辑智能体' : '创建智能体');
  const primaryButtonText = saving ? (cat ? '保存中...' : '创建中...') : cat ? '保存' : '确定';
  const displayAvatar = draftAvatar || buildGeneratedAvatarDataUrl(draftName);

  if (!open) return null;

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    setError(null);
    try {
      setDraftAvatar(await uploadAvatarAsset(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : '头像上传失败');
    } finally {
      setUploadingAvatar(false);
      event.target.value = '';
    }
  };

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
      const formState = cat
        ? buildEditForm(cat, trimmedName, draftDescription, draftAvatar, selectedModel)
        : buildDefaultCreateForm(trimmedName, draftDescription, draftAvatar, selectedModel);
      const payload = buildCatPayload(formState, cat);
      const response = await apiFetch(cat ? `/api/cats/${cat.id}` : '/api/cats', {
        method: cat ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        setError((body.error as string) ?? `${cat ? '保存' : '创建'}失败 (${response.status})`);
        return;
      }

      await onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : cat ? '保存失败' : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6 py-8">
      <div
        className="ui-panel relative flex w-[860px] flex-col overflow-visible rounded-[var(--radius-2xl)] bg-[var(--surface-panel)] shadow-[0_18px_42px_rgba(0,0,0,0.14)]"
        data-testid="create-agent-modal"
      >
        <div className="flex h-[72px] items-center justify-between border-b border-[var(--border-soft)] px-6">
          <h2 className="text-[28px] font-bold text-[var(--text-primary)]">{modalTitle}</h2>
          <button type="button" onClick={onClose} className="ui-icon-button h-10 w-10 rounded-full">
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-col gap-[18px] px-6 pb-[22px] pt-5">
          <div className="space-y-2.5">
            <div className="text-sm font-semibold text-[var(--text-primary)]">名称</div>
            <input
              aria-label="Name"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              className="ui-field h-[52px] w-full px-4 text-base"
            />
          </div>

          <div className="space-y-2.5">
            <div className="text-sm font-semibold text-[var(--text-primary)]">描述（可选）</div>
            <div className="ui-field bg-[var(--surface-panel)] px-4 py-3">
              <textarea
                aria-label="Description"
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                placeholder="请输入描述"
                maxLength={1000}
                className="h-[72px] w-full resize-none border-0 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
              <div className="text-right text-xs text-[var(--text-muted)]">{draftDescription.length}/1000</div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="text-sm font-semibold text-[var(--text-primary)]">图标</div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Upload avatar"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-transparent transition hover:border-[var(--border-accent)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={displayAvatar} alt="Avatar preview" className="h-full w-full object-cover" />
              </button>
              <input
                ref={fileInputRef}
                aria-label="Avatar file input"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/jpg"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <button
                type="button"
                aria-label="Auto generate avatar"
                onClick={() => setDraftAvatar(buildGeneratedAvatarDataUrl(draftName))}
                className="ui-button-secondary h-[34px] w-[34px] rounded-[var(--radius-sm)] p-0"
              >
                <SparklesIcon />
              </button>
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              {uploadingAvatar ? '头像上传中...' : '支持上传 png、jpeg、gif、jpg 格式图片，限制 200kb 内'}
            </div>
          </div>

          <div className="relative space-y-2.5">
            <div className="text-sm font-semibold text-[var(--text-primary)]">模型</div>
            <button
              ref={modelTriggerRef}
              type="button"
              aria-label="Model"
              aria-haspopup="listbox"
              aria-expanded={modelMenuOpen}
              onClick={() => setModelMenuOpen((current) => !current)}
              className="ui-field flex h-8 w-full items-center justify-between rounded-[var(--radius-xs)] bg-[var(--surface-panel)] px-[10px] text-left"
            >
              <ModelSelectValueDraft item={selectedModel} loading={loadingModels} />
              <ModelSelectTriggerIcon />
            </button>

            {modelMenuOpen ? (
              <div
                ref={modelMenuRef}
                className={`absolute left-0 z-20 ${openAbove ? 'bottom-[calc(100%-32px)] mb-2' : 'top-full mt-2'}`}
              >
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

          {error ? <div className="ui-status-error rounded-[var(--radius-md)] px-3 py-2 text-sm">{error}</div> : null}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              aria-label="Cancel"
              onClick={onClose}
              className="ui-button-secondary h-[42px] min-w-[112px] px-6 text-base"
            >
              取消
            </button>
            <button
              type="button"
              aria-label="Create"
              onClick={handleSave}
              disabled={saving}
              className="ui-button-primary h-[42px] min-w-[112px] px-6 text-base font-semibold disabled:opacity-50"
            >
              {primaryButtonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
