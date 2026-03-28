'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { apiFetch } from '@/utils/api-client';
import { useChatStore } from '@/stores/chatStore';
import { CreateApiKeyProfileSection } from './hub-provider-profiles.sections';
import { useProviderProfilesState } from './useProviderProfilesState';

const MODEL_TITLE = '\u6a21\u578b';
const ADD_MODEL = '\u6dfb\u52a0\u6a21\u578b';
const LOADING_TEXT = '\u52a0\u8f7d\u4e2d...';
const EMPTY_TEXT = '\u6682\u65e0\u6a21\u578b\u4fe1\u606f';
const DEFAULT_DESC =
  '\u4e13\u6ce8\u4e8e\u77e5\u8bc6\u95ee\u7b54\u3001\u5185\u5bb9\u521b\u4f5c\u7b49\u901a\u7528\u4efb\u52a1\uff0c\u53ef\u5b9e\u73b0\u9ad8\u6027\u80fd\u4e0e\u4f4e\u6210\u672c\u7684\u5e73\u8861\uff0c\u9002\u7528\u4e8e\u667a\u80fd\u5ba2\u670d\u3001\u4e2a\u6027\u5316\u63a8\u8350\u7b49\u573a\u666f\u3002';

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

function groupKeyFromModelName(name: string): string {
  const firstSegment = name.split('-')[0]?.trim().toLowerCase();
  return firstSegment || 'other';
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

type ModelIconType =
  | 'gpt'
  | 'claude'
  | 'gemini'
  | 'qwen'
  | 'deepseek'
  | 'hunyuan'
  | 'doubao'
  | 'glm'
  | 'llama'
  | 'mistral'
  | 'kimi'
  | 'ernie'
  | 'generic';

function resolveModelIconType(groupKey: string): ModelIconType {
  const key = groupKey.toLowerCase();
  if (key.includes('gpt')) return 'gpt';
  if (key.includes('claude')) return 'claude';
  if (key.includes('gemini')) return 'gemini';
  if (key.includes('qwen')) return 'qwen';
  if (key.includes('deepseek')) return 'deepseek';
  if (key.includes('hunyuan')) return 'hunyuan';
  if (key.includes('doubao')) return 'doubao';
  if (key.includes('chatglm') || key.includes('glm')) return 'glm';
  if (key.includes('llama')) return 'llama';
  if (key.includes('mistral')) return 'mistral';
  if (key.includes('moonshot') || key.includes('kimi')) return 'kimi';
  if (key.includes('ernie') || key.includes('wenxin')) return 'ernie';
  return 'generic';
}

function modelIconVisual(iconType: ModelIconType): { label: string; imageSrc: string } {
  switch (iconType) {
    case 'gpt':
      return { label: 'OpenAI', imageSrc: '/avatars/gpt52.png' };
    case 'claude':
      return { label: 'Anthropic', imageSrc: '/avatars/sonnet.png' };
    case 'gemini':
      return { label: 'Google', imageSrc: '/avatars/gemini.png' };
    case 'qwen':
      return { label: 'Alibaba', imageSrc: '/images/qwen.svg' };
    case 'deepseek':
      return { label: 'DeepSeek', imageSrc: '/images/deepseek.svg' };
    case 'hunyuan':
      return { label: 'Tencent', imageSrc: '/avatars/assistant.svg' };
    case 'doubao':
      return { label: 'ByteDance', imageSrc: '/avatars/assistant.svg' };
    case 'glm':
      return { label: 'Zhipu', imageSrc: '/images/zhipu.svg' };
    case 'llama':
      return { label: 'Meta', imageSrc: '/avatars/assistant.svg' };
    case 'mistral':
      return { label: 'Mistral', imageSrc: '/avatars/assistant.svg' };
    case 'kimi':
      return { label: 'Moonshot', imageSrc: '/images/kimi.svg' };
    case 'ernie':
      return { label: 'Baidu', imageSrc: '/avatars/assistant.svg' };
    default:
      return { label: 'General', imageSrc: '/avatars/assistant.svg' };
  }
}

export function ModelsPanel() {
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<ModelCardData[]>([]);
  const [showAddModelModal, setShowAddModelModal] = useState(false);
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

  const groupedCards = useMemo(() => {
    return cards.reduce<Array<{ key: string; label: string; items: ModelCardData[] }>>((acc, item) => {
      const key = groupKeyFromModelName(item.name);
      const existing = acc.find((group) => group.key === key);
      if (existing) {
        existing.items.push(item);
        return acc;
      }
      acc.push({ key, label: professionalGroupLabel(key), items: [item] });
      return acc;
    }, []);
  }, [cards]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 bg-[#FFFFFF]">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-bold leading-[30px] text-[#1F2329]">{MODEL_TITLE}</h1>
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
      </div>

      <div className="h-px w-full bg-[#EEF2F6]" />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && <p className="py-10 text-center text-sm text-[#8A93A2]">{LOADING_TEXT}</p>}

        {!loading && groupedCards.length === 0 && (
          <p className="py-10 text-center text-sm text-[#8A93A2]">{EMPTY_TEXT}</p>
        )}

        {!loading && groupedCards.length > 0 && (
          <div className="space-y-4 pb-2">
            {groupedCards.map((group) => (
              <section key={group.key} className="space-y-3">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#3B4452]">
                  <svg
                    className="h-3.5 w-3.5 text-[#8C96A5]"
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
                      <article
                        key={card.id}
                        className="rounded-2xl border border-[#E8ECF3] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                      >
                        <div className="flex items-start gap-3">
                          <Image
                            src={visual.imageSrc}
                            alt={`${visual.label} model icon`}
                            width={48}
                            height={48}
                            className="h-12 w-12 shrink-0 rounded-xl border border-[#E8ECF3] object-cover p-1.5"
                            data-testid={`model-card-icon-${iconType}`}
                          />
                          <div className="min-w-0">
                            <h4 className="truncate text-[20px] font-semibold text-[#2D3545]">{card.name}</h4>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="rounded bg-[#F2F5FA] px-1.5 py-0.5 text-[11px] font-medium text-[#7A8392]">
                                {visual.label}
                              </span>
                              <span className="rounded bg-[#F2F5FA] px-1.5 py-0.5 text-[11px] font-medium text-[#7A8392]">
                                {card.object}
                              </span>
                              <span className="rounded bg-[#F2F5FA] px-1.5 py-0.5 text-[11px] font-medium text-[#7A8392]">
                                {card.id}
                              </span>
                            </div>
                          </div>
                        </div>

                        <p className="mt-3 text-[13px] leading-6 text-[#7C8697]">{card.description}</p>

                        <div className="mt-3 flex items-center justify-between text-xs text-[#9AA3B1]">
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
        )}
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
                onClick={() => setShowAddModelModal(false)}
                className="rounded-lg border border-[#DCE1E8] px-3 py-1.5 text-xs font-medium text-[#5F6775] transition-colors hover:bg-[#F7F8FA]"
              >
                关闭
              </button>
            </div>
            <ModelsCreateApiKeyAccount />
          </div>
        </div>
      )}
    </div>
  );
}

function ModelsCreateApiKeyAccount() {
  const { providerCreateSectionProps } = useProviderProfilesState();
  return <CreateApiKeyProfileSection {...providerCreateSectionProps} defaultExpanded />;
}
