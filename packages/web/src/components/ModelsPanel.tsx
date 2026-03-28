'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { apiFetch } from '@/utils/api-client';
import { useChatStore } from '@/stores/chatStore';
import { groupKeyFromModelName, modelIconVisual, resolveModelIconType } from './model-icon';
import { TagEditor } from './hub-tag-editor';

const ADD_MODEL = '添加模型';
const MODEL_TITLE = '模型';
const SEARCH_PLACEHOLDER = '搜索模型、厂商或描述关键词';
const LOADING_TEXT = '加载中...';
const EMPTY_TEXT = '暂无模型信息';
const NO_RESULTS_TEXT = '未找到匹配模型';
const NO_RESULTS_HINT = '试试模型名、厂商名、模型 ID 或描述关键词';
const DEFAULT_DESC = '专注于知识问答、内容创作等通用任务，可实现高性能与低成本的平衡，适用于智能客服、个性化推荐等场景。';

interface MassModelResponseItem {
  id?: string | number;
  object?: string;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

interface ModelCardData {
  id: string;
  object: string;
  name: string;
  description: string;
}

interface ModelCardGroup {
  key: string;
  label: string;
  items: ModelCardData[];
}

function pickStringField(item: MassModelResponseItem, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const value = item[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeModel(item: MassModelResponseItem, index: number): ModelCardData {
  const nameFromKnownFields = pickStringField(item, [
    'name',
    'modelName',
    'model_name',
    'displayName',
    'display_name',
    '\u540d\u79f0',
  ]);

  const genericStringEntries = Object.entries(item).filter(
    ([key, value]) => typeof value === 'string' && key !== 'id' && key !== 'object',
  ) as Array<[string, string]>;

  const inferredName =
    nameFromKnownFields ??
    genericStringEntries.find(([key]) => !/desc|description|描述/i.test(key))?.[1]?.trim() ??
    '';

  const inferredDescription =
    pickStringField(item, ['description', 'desc', '\u63cf\u8ff0']) ??
    genericStringEntries.find(([, value]) => value.trim() !== inferredName)?.[1]?.trim() ??
    DEFAULT_DESC;

  const id = String(item.id ?? `${inferredName || 'model'}-${index}`);
  const object = String(item.object ?? 'model');

  return {
    id,
    object,
    name: inferredName,
    description: inferredDescription,
  };
}

function professionalGroupLabel(groupKey: string): string {
  if (groupKey.includes('gpt')) return 'OpenAI GPT 系列';
  if (groupKey.includes('claude')) return 'Anthropic Claude 系列';
  if (groupKey.includes('gemini')) return 'Google Gemini 系列';
  if (groupKey.includes('qwen')) return 'Alibaba Qwen 系列';
  if (groupKey.includes('deepseek')) return 'DeepSeek 系列';
  if (groupKey.includes('hunyuan')) return 'Tencent Hunyuan 系列';
  if (groupKey.includes('doubao')) return 'ByteDance Doubao 系列';
  if (groupKey.includes('chatglm') || groupKey.includes('glm')) return 'Zhipu GLM 系列';
  if (groupKey.includes('llama')) return 'Meta Llama 系列';
  if (groupKey.includes('mistral')) return 'Mistral 系列';
  if (groupKey.includes('moonshot') || groupKey.includes('kimi')) return 'Moonshot Kimi 系列';
  if (groupKey.includes('ernie') || groupKey.includes('wenxin')) return 'Baidu ERNIE 系列';

  const normalized = groupKey === 'other' ? 'Other' : groupKey;
  const pretty = normalized
    .split(/[._]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
  return `${pretty} 系列`;
}

function buildModelSearchText(card: ModelCardData): string {
  const groupKey = groupKeyFromModelName(card.name);
  const groupLabel = professionalGroupLabel(groupKey);
  const vendorLabel = modelIconVisual(resolveModelIconType(groupKey)).label;

  return [card.name, card.description, card.id, card.object, groupKey, groupLabel, vendorLabel].join(' ').toLowerCase();
}

function groupCards(cards: ModelCardData[]): ModelCardGroup[] {
  return cards.reduce<ModelCardGroup[]>((acc, item) => {
    const key = groupKeyFromModelName(item.name);
    const existing = acc.find((group) => group.key === key);
    if (existing) {
      existing.items.push(item);
      return acc;
    }
    acc.push({ key, label: professionalGroupLabel(key), items: [item] });
    return acc;
  }, []);
}

export function ModelsPanel() {
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cards, setCards] = useState<ModelCardData[]>([]);
  const [showAddModelModal, setShowAddModelModal] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const openHub = useChatStore((s) => s.openHub);
  const currentProjectPath = useChatStore((s) => s.currentProjectPath);

  const buildModelsUrl = useCallback(() => {
    const query = new URLSearchParams();
    if (currentProjectPath && currentProjectPath !== 'default') {
      query.set('projectPath', currentProjectPath);
    }
    const queryText = query.toString();
    return queryText ? `/api/maas-models?${queryText}` : '/api/maas-models';
  }, [currentProjectPath]);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(buildModelsUrl());
      if (!res.ok) {
        setCards([]);
        return;
      }
      const json = (await res.json()) as { list?: MassModelResponseItem[]; models?: MassModelResponseItem[] };
      const source = Array.isArray(json.list) ? json.list : Array.isArray(json.models) ? json.models : [];
      setCards(source.map(normalizeModel));
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [buildModelsUrl]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await apiFetch(buildModelsUrl());
        if (!res.ok) {
          if (!cancelled) setCards([]);
          return;
        }
        const json = (await res.json()) as { list?: MassModelResponseItem[]; models?: MassModelResponseItem[] };
        const source = Array.isArray(json.list) ? json.list : Array.isArray(json.models) ? json.models : [];
        if (!cancelled) setCards(source.map(normalizeModel));
      } catch {
        if (!cancelled) setCards([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildModelsUrl]);

  const normalizedQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

  const filteredCards = useMemo(() => {
    if (!normalizedQuery) return cards;
    return cards.filter((card) => buildModelSearchText(card).includes(normalizedQuery));
  }, [cards, normalizedQuery]);

  const groupedCards = useMemo(() => groupCards(filteredCards), [filteredCards]);
  const hasSearchQuery = normalizedQuery.length > 0;
  const showEmptyData = !loading && cards.length === 0;
  const showNoResults = !loading && cards.length > 0 && hasSearchQuery && groupedCards.length === 0;
  const showGroups = !loading && groupedCards.length > 0;

  return (
    <div className="ui-page-shell">
      <div className="ui-page-header">
        <h1 className="ui-page-title">{MODEL_TITLE}</h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 pb-2">
          <section className='flex justify-between gap-2'>
            <div className="relative flex-1 mr-2">
              <input
                type="search"
                aria-label="搜索模型"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={SEARCH_PLACEHOLDER}
                className="ui-field w-full px-3 py-1.5 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openHub('provider-profiles')}
                className="rounded-[16px] border border-[#DCE1E8] px-3 py-1.5 text-[12px] font-medium text-[#5F6775] transition-colors hover:bg-[#F7F8FA]"
              >
                ACP / 账号配置
              </button>
              <button
                type="button"
                onClick={() => setShowAddModelModal(true)}
                className="rounded-[16px] bg-[#101317] px-4 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#262C34]"
              >
                {ADD_MODEL}
              </button>
            </div>
          </section>

          {loading && <p className="py-10 text-center text-sm text-[var(--text-muted)]">{LOADING_TEXT}</p>}

          {showEmptyData && <p className="py-10 text-center text-sm text-[var(--text-muted)]">{EMPTY_TEXT}</p>}

          {showNoResults && (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-[var(--text-secondary)]">{NO_RESULTS_TEXT}</p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">{NO_RESULTS_HINT}</p>
            </div>
          )}

          {showGroups &&
            groupedCards.map((group) => (
              <section key={group.key} className="space-y-3">
                <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-secondary)]">
                  <svg
                    className="h-3.5 w-3.5 text-[var(--text-muted)]"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m6 12 4-4 4 4" />
                  </svg>
                  {group.label} ({group.items.length})
                </h3>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((card) => {
                    const iconType = resolveModelIconType(groupKeyFromModelName(card.name));
                    const visual = modelIconVisual(iconType);
                    return (
                      <article key={card.id} className="ui-card px-4 py-4">
                        <div className="flex items-start gap-3">
                          <Image
                            src={visual.imageSrc}
                            alt={`${visual.label} model icon`}
                            width={48}
                            height={48}
                            className="h-12 w-12 shrink-0 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-card-muted)] object-cover p-1.5"
                            data-testid={`model-card-icon-${iconType}`}
                          />
                          <div className="min-w-0">
                            <h4 className="truncate text-[var(--font-size-xl)] font-semibold text-[var(--text-primary)]">
                              {card.name}
                            </h4>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="ui-badge-muted">{visual.label}</span>
                              <span className="ui-badge-muted">{card.object}</span>
                              <span className="ui-badge-muted">{card.id}</span>
                            </div>
                          </div>
                        </div>

                        <p className="mt-3 text-[13px] leading-6 text-[var(--text-secondary)]">{card.description}</p>

                        <div className="ui-thread-meta mt-3 flex items-center justify-between">
                          <span>{card.object}</span>
                          <span>ID: {card.id}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
        </div>
      </div>

      {showAddModelModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={() => setShowAddModelModal(false)}
          data-testid="models-add-model-modal"
        >
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#2E3440]">{ADD_MODEL}</h3>
              <button
                type="button"
                onClick={() => {
                  setCreateError(null);
                  setShowAddModelModal(false);
                }}
                className="rounded-lg border border-[#DCE1E8] px-3 py-1.5 text-xs font-medium text-[#5F6775] transition-colors hover:bg-[#F7F8FA]"
              >
                关闭
              </button>
            </div>
            <ModelsCreateModelConfigSource
              projectPath={currentProjectPath && currentProjectPath !== 'default' ? currentProjectPath : null}
              error={createError}
              onError={setCreateError}
              onCreated={async () => {
                setCreateError(null);
                await fetchModels();
                setShowAddModelModal(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function parseHeadersJson(value: string): Record<string, string> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Headers 必须是 JSON 对象');
  }
  const entries = Object.entries(parsed).map(([key, rawValue]) => {
    const normalizedKey = key.trim();
    const normalizedValue = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!normalizedKey || !normalizedValue) {
      throw new Error('Headers 的 key 和 value 都必须是非空字符串');
    }
    return [normalizedKey, normalizedValue] as const;
  });
  return Object.fromEntries(entries);
}

function generateModelConfigSourceId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (typeof uuid === 'string' && uuid.trim()) {
    return uuid.replace(/-/g, '').slice(0, 8);
  }
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
}

function ModelsCreateModelConfigSource({
  projectPath,
  error,
  onError,
  onCreated,
}: {
  projectPath: string | null;
  error: string | null;
  onError: (value: string | null) => void;
  onCreated: () => Promise<void>;
}) {
  const [sourceId, setSourceId] = useState(() => generateModelConfigSourceId());
  const [displayName, setDisplayName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const canCreate =
    displayName.trim().length > 0 &&
    baseUrl.trim().length > 0 &&
    apiKey.trim().length > 0 &&
    models.length > 0;

  const reset = () => {
    setSourceId(generateModelConfigSourceId());
    setDisplayName('');
    setBaseUrl('');
    setApiKey('');
    setHeadersText('');
    setModels([]);
  };

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-500">{error}</p> : null}
      <select
        value="openai"
        disabled
        aria-label="协议"
        className="w-full rounded border border-[#DCE2EB] bg-[#F7F8FA] px-3 py-2 text-sm text-[#5F6775]"
      >
        <option value="openai">OpenAI</option>
      </select>
      <input
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        placeholder="显示名称，如 My OpenAI Proxy"
        autoComplete="off"
        className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
      />
      <input
        value={baseUrl}
        onChange={(event) => setBaseUrl(event.target.value)}
        placeholder="Base URL，如 https://api.example.com/v1"
        autoComplete="off"
        className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
      />
      <input
        type="password"
        autoComplete="off"
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
        placeholder="API Key"
        className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
      />
      <textarea
        value={headersText}
        onChange={(event) => setHeadersText(event.target.value)}
        rows={4}
        placeholder={'可选请求头(JSON)，如 {"X-App-Id":"cat-cafe"}'}
        className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm placeholder:text-[#A8B0BD]"
      />
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[#6E7785]">可用模型 *</p>
        <TagEditor
          tags={models}
          tone="purple"
          addLabel="+ 添加模型"
          placeholder="输入模型名，如 gpt-4o-mini"
          emptyLabel="(至少添加 1 个模型)"
          onChange={setModels}
          minCount={0}
        />
      </div>
      <button
        type="button"
        disabled={busy || !canCreate}
        onClick={async () => {
          onError(null);
          setBusy(true);
          try {
            const headers = parseHeadersJson(headersText);
            const res = await apiFetch('/api/model-config-profiles', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                ...(projectPath ? { projectPath } : {}),
                sourceId: sourceId.trim(),
                displayName: displayName.trim(),
                baseUrl: baseUrl.trim(),
                apiKey: apiKey.trim(),
                ...(headers ? { headers } : {}),
                models,
              }),
            });
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) {
              throw new Error(body.error ?? `请求失败 (${res.status})`);
            }
            reset();
            await onCreated();
          } catch (createError) {
            onError(createError instanceof Error ? createError.message : String(createError));
          } finally {
            setBusy(false);
          }
        }}
        className="rounded bg-[#111418] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2A3038] disabled:opacity-50"
      >
        {busy ? '创建中...' : '创建'}
      </button>
    </div>
  );
}
