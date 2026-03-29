'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { useChatStore } from '@/stores/chatStore';
import { CreateApiKeyProfileSection } from './hub-provider-profiles.sections';
import { useProviderProfilesState } from './useProviderProfilesState';

const MODEL_TITLE = '模型';
const SEARCH_PLACEHOLDER = '输入关键字搜索、过滤';
const LOADING_TEXT = '加载中...';
const EMPTY_TEXT = '暂无模型信息';
const NO_RESULTS_TEXT = '未找到匹配模型';
const NO_RESULTS_HINT = '试试模型名、厂商名、模型 ID 或描述关键词';
const DEFAULT_DESC = '专注于知识问答、内容创作等通用任务，可实现高性能与低成本的平衡，适用于智能客服、个性化推荐等场景。';
const HUAWEI_MAAS_GROUP_LABEL = '华为云 MaaS';
const DEFAULT_ICON = '/avatars/assistant.svg';
const DEFAULT_DEVELOPER = '华为云 MaaS';

interface MassModelResponseItem {
  id?: string | number;
  object?: string;
  name?: string;
  description?: string;
  labels?: unknown;
  developer?: unknown;
  icon?: unknown;
  [key: string]: unknown;
}

interface ModelCardData {
  id: string;
  object: string;
  name: string;
  description: string;
  labels: string[];
  developer: string;
  icon: string;
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

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/[,\uff0c/|]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeModel(item: MassModelResponseItem, index: number): ModelCardData {
  const nameFromKnownFields = pickStringField(item, [
    'name',
    'modelName',
    'model_name',
    'displayName',
    'display_name',
    '名称',
  ]);

  const genericStringEntries = Object.entries(item).filter(
    ([key, value]) => typeof value === 'string' && key !== 'id' && key !== 'object',
  ) as Array<[string, string]>;

  const inferredName = nameFromKnownFields ?? genericStringEntries.find(([key]) => !/desc|description|描述/i.test(key))?.[1]?.trim() ?? '';

  const inferredDescription =
    pickStringField(item, ['description', 'desc', '描述']) ??
    genericStringEntries.find(([, value]) => value.trim() !== inferredName)?.[1]?.trim() ??
    DEFAULT_DESC;

  const id = String(item.id ?? `${inferredName || 'model'}-${index}`);
  const object = String(item.object ?? 'model');
  const labels = normalizeStringArray(item.labels || []);
  const developer =
    pickStringField(item, ['developer', 'provider', 'vendor', 'publisher', 'company']) ?? DEFAULT_DEVELOPER;
  const icon = pickStringField(item, ['icon', 'logo', 'image', 'avatar']) ?? DEFAULT_ICON;

  return {
    id,
    object,
    name: inferredName,
    description: inferredDescription,
    labels,
    developer,
    icon,
  };
}

function buildModelSearchText(card: ModelCardData): string {
  return [
    card.name,
    card.description,
    card.id,
    card.object,
    card.developer,
    HUAWEI_MAAS_GROUP_LABEL,
    ...card.labels,
  ]
    .join(' ')
    .toLowerCase();
}

function groupCards(cards: ModelCardData[]): ModelCardGroup[] {
  if (cards.length === 0) return [];
  return [{ key: 'huawei-maas', label: HUAWEI_MAAS_GROUP_LABEL, items: cards }];
}

export function ModelsPanel() {
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cards, setCards] = useState<ModelCardData[]>([]);
  const openHub = useChatStore((s) => s.openHub);

  useEffect(() => {
    let cancelled = false;
    const fetchModels = async () => {
      setLoading(true);
      try {
        const res = await apiFetch('/api/maas-models');
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
    };

    void fetchModels();
    return () => {
      cancelled = true;
    };
  }, []);

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
          <section>
            <input
              type="search"
              aria-label="搜索模型"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={SEARCH_PLACEHOLDER}
              className="ui-field w-full px-3 py-1.5 text-xs"
            />
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
                <h3 className="text-[13px] font-semibold text-[var(--text-secondary)]">
                  {group.label} ({group.items.length})
                </h3>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((card) => (
                    <article key={card.id} className="ui-card px-4 py-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={card.icon || DEFAULT_ICON}
                            alt={`${card.name} icon`}
                            width={48}
                            height={48}
                            className="h-12 w-12 shrink-0 rounded-[var(--radius-lg)] border border-[var(--border-default)] object-cover p-1.5"
                            data-testid={`model-card-icon-${card.id}`}
                          />

                          <div className="min-w-0 flex-1">
                            <h4 className="truncate text-[var(--font-size-xl)] font-semibold text-[var(--text-primary)]">
                              {card.name}
                            </h4>
                            {card.labels.length > 0 ? (
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {card.labels.map((label, index) => (
                                  <span key={`${card.id}-label-${label}-${index}`} className="ui-badge-muted">
                                    {label}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <p
                          className="mt-3 text-[13px] leading-6 text-[var(--text-secondary)] line-clamp-2 overflow-hidden"
                          title={card.description}
                        >
                          {card.description}
                        </p>

                      </div>
                      <div className="ui-thread-meta mt-3 flex items-center justify-start">
                        <span className="inline-flex items-center gap-1.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={card.icon || DEFAULT_ICON}
                            alt={`${card.developer} icon`}
                            width={16}
                            height={16}
                            className="h-4 w-4 rounded-sm object-cover"
                          />
                          <span>{card.developer}</span>
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
        </div>
      </div>
    </div>
  );
}
