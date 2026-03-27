'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

const MODEL_TITLE = '\u6a21\u578b';
const ADD_MODEL = '\u6dfb\u52a0\u6a21\u578b';
const MODEL_SETTINGS = '\u53c2\u6570\u7ba1\u7406';
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

export function ModelsPanel() {
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<ModelCardData[]>([]);

  useEffect(() => {
    let cancelled = false;
    const fetchModels = async () => {
      setLoading(true);
      try {
        const res = await apiFetch('/api/mass-models');
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
        <h1 className="text-[34px] font-semibold leading-none text-[#1F2329]">{MODEL_TITLE}</h1>
        <div className="flex flex-col items-end gap-2.5">
          <button
            type="button"
            className="rounded-[16px] bg-[#101317] px-4 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#262C34]"
          >
            {ADD_MODEL}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8A93A2] transition-colors hover:text-[#5D6674]"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
              <path d="m19.4 15 1.1 1.9-2 3.4-2.2-.5a8 8 0 0 1-1.5.9l-.6 2.2H10l-.6-2.2a8 8 0 0 1-1.5-.9l-2.2.5-2-3.4L5 15a8.3 8.3 0 0 1 0-1.9L3.7 11l2-3.4 2.2.5c.5-.4 1-.7 1.5-.9L10 5h4l.6 2.2c.5.2 1 .5 1.5.9l2.2-.5 2 3.4-1.1 2.1c.1.6.1 1.3 0 1.9Z" />
            </svg>
            {MODEL_SETTINGS}
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
                    return (
                      <article
                        key={card.id}
                        className="rounded-2xl border border-[#E8ECF3] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0">
                            <h4 className="truncate text-[20px] font-semibold text-[#2D3545]">{card.name}</h4>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
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
    </div>
  );
}
