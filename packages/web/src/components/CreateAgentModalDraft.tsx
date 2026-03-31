'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { CatData } from '@/hooks/useCatData';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import { uploadAvatarAsset } from './hub-cat-editor.client';
import { builtinAccountIdForClient, CLIENT_OPTIONS, filterAccounts } from './hub-cat-editor.model';
import { initialState, type ClientValue, type HubCatEditorDraft, type HubCatEditorFormState } from './hub-cat-editor.model';
import { buildCatPayload } from './hub-cat-editor.payload';
import {
  ModelSelectDropdownDraft,
  ModelSelectTriggerIcon,
  ModelSelectValueDraft,
  type DraftModelOption,
} from './ModelSelectDropdownDraft';
import type { ProfileItem, ProviderProfilesResponse } from './hub-provider-profiles.types';

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

interface ModelConfigProfilesResponse {
  projectPath: string;
  fallbackToProviderProfiles?: boolean;
  exists: boolean;
  providers: ProfileItem[];
}

interface MaaSModelResponseItem {
  id?: string | number;
  name?: string;
  icon?: string;
  logo?: string;
  image?: string;
  avatar?: string;
  [key: string]: unknown;
}

interface MaaSModelMeta {
  displayName: string;
  icon?: string;
}

const MODEL_MENU_MAX_HEIGHT = 335;
const MODEL_MENU_OFFSET = 8;

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

function buildProjectScopedUrl(path: string, projectPath: string | null | undefined): string {
  if (!projectPath || projectPath === 'default') return path;
  const query = new URLSearchParams({ projectPath });
  return `${path}?${query.toString()}`;
}

function pickStringField(item: Record<string, unknown>, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const value = item[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function normalizeModelLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildModelMetaMap(source: MaaSModelResponseItem[]): Record<string, MaaSModelMeta> {
  const next: Record<string, MaaSModelMeta> = {};

  for (const item of source) {
    const id = pickStringField(item, ['id']);
    const name = pickStringField(item, ['name']);
    const displayName = name ?? id;
    const icon = pickStringField(item, ['icon', 'logo', 'image', 'avatar']);
    if (!displayName) continue;

    const meta: MaaSModelMeta = { displayName, ...(icon ? { icon } : {}) };

    if (id) next[normalizeModelLookupKey(id)] = meta;
    if (name) next[normalizeModelLookupKey(name)] = meta;
  }

  return next;
}

function getModelMeta(
  map: Record<string, MaaSModelMeta>,
  modelIdOrName: string | null | undefined,
): MaaSModelMeta | null {
  if (!modelIdOrName) return null;
  return map[normalizeModelLookupKey(modelIdOrName)] ?? null;
}

function mergeAcpProfiles(baseProfiles: ProfileItem[], providerProfiles: ProfileItem[]): ProfileItem[] {
  const nextProfiles = [...baseProfiles];
  const seen = new Set(baseProfiles.map((profile) => profile.id));
  for (const profile of providerProfiles) {
    if (profile.kind !== 'acp' || seen.has(profile.id)) continue;
    nextProfiles.push(profile);
    seen.add(profile.id);
  }
  return nextProfiles;
}

async function loadProfilesForClient(
  projectPath: string | null | undefined,
  client: ClientValue,
): Promise<ProfileItem[]> {
  const modelConfigUrl = '/api/model-config-profiles';
  const providerProfilesUrl = buildProjectScopedUrl('/api/provider-profiles', projectPath);
  const needsAcpProfiles = client === 'acp';

  async function readProviderProfiles(): Promise<ProfileItem[]> {
    const providerProfilesRes = await apiFetch(providerProfilesUrl);
    if (!providerProfilesRes.ok) throw new Error(`模型配置加载失败 (${providerProfilesRes.status})`);
    const providerProfilesBody = (await providerProfilesRes.json()) as ProviderProfilesResponse;
    return providerProfilesBody.providers;
  }

  let modelConfigRes: Response;
  try {
    modelConfigRes = await apiFetch(modelConfigUrl);
  } catch {
    const providerProfiles = await readProviderProfiles();
    return needsAcpProfiles ? providerProfiles.filter((profile) => profile.kind === 'acp') : providerProfiles;
  }

  if (!modelConfigRes.ok) {
    if (modelConfigRes.status === 404) return [];
    throw new Error(`模型配置加载失败 (${modelConfigRes.status})`);
  }

  const body = (await modelConfigRes.json()) as ModelConfigProfilesResponse;
  if (body.exists) {
    if (!needsAcpProfiles) return body.providers;
    return mergeAcpProfiles(body.providers, await readProviderProfiles());
  }

  if (needsAcpProfiles) {
    return (await readProviderProfiles()).filter((profile) => profile.kind === 'acp');
  }

  if (!body.fallbackToProviderProfiles) return [];
  return readProviderProfiles();
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
    embeddedAcpExecutablePath: '',
    embeddedAcpArgs: '',
    embeddedAcpCwd: '',
    embeddedAcpEnvText: '',
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
  const [selectedClient, setSelectedClient] = useState<ClientValue>(draft?.client ?? ((cat?.provider as ClientValue | undefined) ?? 'anthropic'));
  const [selectedAccountRef, setSelectedAccountRef] = useState(draft?.accountRef ?? cat?.accountRef ?? cat?.providerProfileId ?? '');
  const [draftModelId, setDraftModelId] = useState<string | null>(selectedModelId);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [modelMetaMap, setModelMetaMap] = useState<Record<string, MaaSModelMeta>>({});
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const modelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const currentProjectPath = useChatStore((state) => state.currentProjectPath);

  useEffect(() => {
    if (!open) return;
    setDraftName(name || cat?.name || cat?.displayName || 'BOT');
    setDraftDescription(description || cat?.roleDescription || '');
    setDraftAvatar(resolveInitialAvatar(cat));
    setSelectedClient(draft?.client ?? ((cat?.provider as ClientValue | undefined) ?? 'anthropic'));
    setSelectedAccountRef(draft?.accountRef ?? cat?.accountRef ?? cat?.providerProfileId ?? '');
    setDraftModelId(resolveInitialModelId(cat, draft, selectedModelId));
    setModelMenuOpen(false);
    setOpenAbove(false);
    setError(null);
  }, [cat, description, draft, name, open, selectedModelId]);

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
    setLoadingProfiles(true);
    loadProfilesForClient(currentProjectPath, selectedClient)
      .then((nextProfiles) => {
        if (cancelled) return;
        setProfiles(nextProfiles);
      })
      .catch((err) => {
        if (cancelled) return;
        setProfiles([]);
        setError(err instanceof Error ? err.message : '模型配置加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoadingProfiles(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentProjectPath, open, selectedClient]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await apiFetch(buildProjectScopedUrl('/api/maas-models', currentProjectPath));
        if (!res.ok) {
          if (!cancelled) setModelMetaMap({});
          return;
        }
        const body = (await res.json()) as { list?: MaaSModelResponseItem[]; models?: MaaSModelResponseItem[] };
        const source = Array.isArray(body.list) ? body.list : Array.isArray(body.models) ? body.models : [];
        if (!cancelled) setModelMetaMap(buildModelMetaMap(source));
      } catch {
        if (!cancelled) setModelMetaMap({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentProjectPath, open]);

  const availableProfiles = useMemo(() => filterAccounts(selectedClient, profiles), [profiles, selectedClient]);
  const selectedProfile = useMemo(
    () => availableProfiles.find((profile) => profile.id === selectedAccountRef) ?? null,
    [availableProfiles, selectedAccountRef],
  );
  const modelOptions = useMemo(() => {
    if (selectedClient === 'antigravity' || selectedClient === 'acp') return [];
    const currentModel = draftModelId?.trim() ?? '';
    const profileModels = selectedProfile?.models?.map((value) => value.trim()).filter(Boolean) ?? [];
    if (currentModel && !profileModels.includes(currentModel)) {
      return [currentModel, ...profileModels];
    }
    return profileModels;
  }, [draftModelId, selectedClient, selectedProfile]);
  const availableModels = useMemo<CreateModelOption[]>(
    () =>
      modelOptions.map((modelName) => {
        const meta = getModelMeta(modelMetaMap, modelName);
        return {
          id: modelName,
          name: meta?.displayName ?? modelName,
          icon: meta?.icon,
          profileId: selectedProfile?.id,
          client: selectedClient,
          model: modelName,
          authType: selectedProfile?.authType,
          providerName: selectedProfile?.provider,
          providerGroup: selectedProfile?.displayName || selectedProfile?.name || selectedProfile?.provider || undefined,
        };
      }),
    [modelMetaMap, modelOptions, selectedClient, selectedProfile],
  );
  const selectedModel = useMemo(
    () =>
      (draftModelId ? availableModels.find((item) => item.id === draftModelId) : null) ??
      (draftModelId
        ? (() => {
            const meta = getModelMeta(modelMetaMap, draftModelId);
            return {
              id: draftModelId,
              name: meta?.displayName ?? draftModelId,
              icon: meta?.icon,
              profileId: selectedProfile?.id,
              client: selectedClient,
              model: draftModelId,
              authType: selectedProfile?.authType,
              providerName: selectedProfile?.provider,
              providerGroup: selectedProfile?.displayName || selectedProfile?.name || selectedProfile?.provider || undefined,
            };
          })()
        : null) ??
      availableModels[0] ??
      null,
    [availableModels, draftModelId, modelMetaMap, selectedClient, selectedProfile],
  );

  useLayoutEffect(() => {
    if (!modelMenuOpen || !modelTriggerRef.current) return;

    const rect = modelTriggerRef.current.getBoundingClientRect();
    const estimatedMenuHeight =
      modelMenuRef.current?.offsetHeight ?? Math.min(Math.max(availableModels.length, 1) * 34 + 52, MODEL_MENU_MAX_HEIGHT);
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenAbove(spaceBelow < estimatedMenuHeight + MODEL_MENU_OFFSET);
  }, [availableModels.length, modelMenuOpen]);

  useEffect(() => {
    if (!open) return;
    if (selectedClient === 'antigravity') {
      setSelectedAccountRef('');
      return;
    }
    if (availableProfiles.length === 0) return;
    const preferredBuiltin = builtinAccountIdForClient(selectedClient);
    const nextProfile =
      availableProfiles.find((profile) => profile.id === selectedAccountRef) ??
      (preferredBuiltin ? availableProfiles.find((profile) => profile.id === preferredBuiltin) : null) ??
      availableProfiles[0] ??
      null;
    if (!nextProfile || nextProfile.id === selectedAccountRef) return;
    setSelectedAccountRef(nextProfile.id);
  }, [availableProfiles, open, selectedAccountRef, selectedClient]);

  useEffect(() => {
    if (!open || selectedClient === 'antigravity' || selectedClient === 'acp' || modelOptions.length === 0) return;
    const currentModel = draftModelId?.trim() ?? '';
    if (currentModel && modelOptions.includes(currentModel)) return;
    setDraftModelId(modelOptions[0] ?? null);
  }, [draftModelId, modelOptions, open, selectedClient]);

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
      let formState: HubCatEditorFormState;
      if (cat) {
        formState = buildEditForm(cat, trimmedName, draftDescription, draftAvatar, selectedModel);
      } else {
        formState = buildDefaultCreateForm(trimmedName, draftDescription, draftAvatar, selectedModel);
      }
      const payload = (buildCatPayload as (form: HubCatEditorFormState, cat?: CatData | null) => Record<string, unknown>)(
        formState,
        cat,
      );
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
        className="ui-panel relative flex h-[642px] w-[550px] flex-col overflow-hidden rounded-[var(--radius-2xl)] bg-[var(--surface-panel)] shadow-[0_18px_42px_rgba(0,0,0,0.14)]"
        data-testid="create-agent-modal"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-6 py-6">
          <h2 className="text-[18px] font-bold text-[var(--text-primary)]">{modalTitle}</h2>
          <button type="button" onClick={onClose} className="ui-icon-button h-10 w-10 rounded-full">
            <CloseIcon />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 pb-6 pt-6">
          <div className="space-y-2.5">
            <div className="text-[12px] font-semibold text-[var(--text-primary)]">名称</div>
            <input
              aria-label="Name"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              className="ui-field h-[28px] w-full px-4 text-base"
            />
          </div>

          <div className="space-y-2.5">
            <div className="text-[12px] font-semibold text-[var(--text-primary)]">描述（可选）</div>
            <div className="ui-field relative bg-[var(--surface-panel)] px-4 py-3">
              <textarea
                aria-label="Description"
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                placeholder="请输入描述"
                maxLength={1000}
                className="h-[84px] min-h-[84px] w-full resize-y border-0 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
              <div className="pointer-events-none absolute bottom-3 right-10 text-xs text-[var(--text-muted)]">
                {draftDescription.length}/1000
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="text-[12px] font-semibold text-[var(--text-primary)]">图标</div>
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
            <div className="text-[12px] font-semibold text-[var(--text-primary)]">Client</div>
            <div className="relative">
              <select
                aria-label="Client"
                value={selectedClient}
                onChange={(event) => {
                  setSelectedClient(event.target.value as ClientValue);
                  setSelectedAccountRef('');
                  setDraftModelId(null);
                  setModelMenuOpen(false);
                }}
                className="ui-field h-[44px] w-full appearance-none px-4 pr-10 text-sm"
              >
                {CLIENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[var(--text-muted)]">
                <ModelSelectTriggerIcon />
              </span>
            </div>
          </div>

          {selectedClient !== 'antigravity' ? (
            <div className="relative space-y-2.5">
              <div className="text-[12px] font-semibold text-[var(--text-primary)]">认证信息</div>
              <div className="relative">
                <select
                  aria-label="认证信息"
                  value={selectedAccountRef}
                  onChange={(event) => {
                    setSelectedAccountRef(event.target.value);
                    setDraftModelId(null);
                    setModelMenuOpen(false);
                  }}
                  disabled={loadingProfiles}
                  className="ui-field h-[44px] w-full appearance-none px-4 pr-10 text-sm"
                >
                  <option value="">{loadingProfiles ? '加载中…' : '请选择认证方式'}</option>
                  {availableProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.source === 'model_config'
                        ? profile.displayName
                        : profile.builtin
                          ? `${profile.displayName}（内置）`
                          : profile.kind === 'acp'
                            ? `${profile.displayName}（ACP）`
                            : `${profile.displayName}（API Key）`}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[var(--text-muted)]">
                  <ModelSelectTriggerIcon />
                </span>
              </div>
            </div>
          ) : null}

          <div className="relative space-y-2.5">
            <div className="text-[12px] font-semibold text-[var(--text-primary)]">模型</div>
            {availableModels.length > 0 ? (
              <>
                <button
                  ref={modelTriggerRef}
                  type="button"
                  aria-label="Model"
                  aria-haspopup="listbox"
                  aria-expanded={modelMenuOpen}
                  onClick={() => setModelMenuOpen((current) => !current)}
                  className="ui-field flex h-8 w-full items-center justify-between rounded-[var(--radius-xs)] bg-[var(--surface-panel)] px-[10px] text-left"
                >
                  <ModelSelectValueDraft item={selectedModel} loading={loadingProfiles} />
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
              </>
            ) : (
              <input
                aria-label="Model"
                value={draftModelId ?? ''}
                onChange={(event) => setDraftModelId(event.target.value)}
                className="ui-field h-[44px] w-full px-4 text-sm"
                placeholder={
                  selectedClient === 'acp'
                    ? '显示标签，可留如 agent-teams/default'
                    : selectedClient === 'opencode'
                      ? '例如 openai/gpt-5.4'
                      : '模型标识符'
                }
              />
            )}
          </div>

          {error ? <div className="ui-status-error rounded-[var(--radius-md)] px-3 py-2 text-sm">{error}</div> : null}
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-[var(--border-soft)] bg-[var(--surface-panel)] px-6 py-4">
            <button
              type="button"
              aria-label="Cancel"
              onClick={onClose}
              className="ui-button-secondary h-[32px] w-[96px] px-0 text-[14px]"
            >
              取消
            </button>
            <button
              type="button"
              aria-label="Create"
              onClick={handleSave}
              disabled={saving}
              className="ui-button-primary h-[32px] w-[96px] px-0 text-[14px] font-semibold disabled:opacity-50"
            >
              {primaryButtonText}
            </button>
          </div>
      </div>
    </div>
  );
}
