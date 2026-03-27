'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCatData } from '@/hooks/useCatData';
import { apiFetch } from '@/utils/api-client';
import type { ConfigData } from './config-viewer-types';
import { HubCatEditor } from './HubCatEditor';

type AgentTabKey = 'persona' | 'collab' | 'memory' | 'preference';

const AGENT_TABS: Array<{ id: AgentTabKey; label: string }> = [
  { id: 'persona', label: '灵魂配置' },
  { id: 'collab', label: '协作配置' },
  { id: 'memory', label: '记忆配置' },
  { id: 'preference', label: '用户偏好' },
];

const INSPIRATION_TEMPLATES = [
  {
    id: 'customer-service',
    title: '专业客服助手',
    description: '遵循服务规范，礼貌应答，流程引导，问题定位与转接明确。',
    persona: [
      '身份：资深客服顾问，擅长复杂问题拆解与安抚沟通。',
      '性格：耐心克制、语气专业、表达清晰。',
      '行为：先确认诉求，再给步骤方案，必要时主动引导升级处理。',
    ],
    applyLabel: '接入模板',
  },
  {
    id: 'content-creation',
    title: '内容创作助手',
    description: '支持文案策写、标题优化、脚本创作，风格适配，结构清晰。',
    persona: [
      '身份：资深内容创作者，擅长根据主题快速成稿。',
      '性格：创意灵活、语气温和、结构清晰。',
      '行为：聚焦目标、突出重点，给出可执行建议。',
    ],
    applyLabel: '接入模板',
  },
  {
    id: 'knowledge-answering',
    title: '知识解答专家',
    description: '以严谨准确为原则，条理输出，解释清楚，给出可执行建议。',
    persona: [
      '身份：知识顾问，擅长多源信息整合与严谨解释。',
      '性格：理性克制、客观中立、注重依据。',
      '行为：先定义问题边界，再逐层解释并给出结论与风险提示。',
    ],
    applyLabel: '接入模板',
  },
  {
    id: 'work-efficiency',
    title: '职场效率助手',
    description: '聚焦沟通协作、汇报提炼、流程推进，帮助提升交付效率。',
    persona: [
      '身份：项目协作教练，擅长流程梳理与任务推进。',
      '性格：简洁务实、节奏明确、结果导向。',
      '行为：优先给行动清单，再补充沟通模板与复盘建议。',
    ],
    applyLabel: '接入模板',
  },
];

const TEMPLATE_PREVIEW_WIDTH = 400;
const TEMPLATE_PREVIEW_SIDE_PADDING = 24;

function formatBudgetLabel(value?: number): string {
  if (!value || Number.isNaN(value)) return '-- KB';
  const kb = Math.max(1, Math.round(value / 1024));
  return `${kb} KB`;
}

function catInitial(name?: string): string {
  if (!name) return '智';
  return name.slice(0, 1).toUpperCase();
}

export function AgentsPanel() {
  const { cats, refresh } = useCatData();
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AgentTabKey>('persona');
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [hoveredTemplateId, setHoveredTemplateId] = useState<string | null>(null);
  const [hoveredTemplatePosition, setHoveredTemplatePosition] = useState<{ left: number; top: number } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const hoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const templatePreviewLayerRef = useRef<HTMLDivElement | null>(null);
  const hoveredTemplateTriggerRef = useRef<HTMLElement | null>(null);

  const fetchData = useCallback(async () => {
    setFetchError(null);
    try {
      const res = await apiFetch('/api/config');
      if (res.ok) {
        const d = (await res.json()) as { config: ConfigData };
        setConfig(d.config);
      } else {
        setFetchError('配置加载失败');
      }
    } catch {
      setFetchError('网络错误');
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAddMember = useCallback(() => {
    setEditingCatId(null);
    setEditorOpen(true);
  }, []);

  const openEditMember = useCallback((catId: string) => {
    setEditingCatId(catId);
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingCatId(null);
  }, []);

  const handleEditorSaved = useCallback(async () => {
    await Promise.all([fetchData(), refresh()]);
  }, [fetchData, refresh]);

  const editingCat = editingCatId ? cats.find((c) => c.id === editingCatId) : null;
  const editingConfigCat = editingCatId && config ? config.cats[editingCatId] : undefined;

  const selectedCat = useMemo(
    () => (selectedCatId ? cats.find((cat) => cat.id === selectedCatId) ?? null : cats[0] ?? null),
    [cats, selectedCatId],
  );
  const hoveredTemplate = useMemo(
    () => INSPIRATION_TEMPLATES.find((template) => template.id === hoveredTemplateId) ?? null,
    [hoveredTemplateId],
  );

  useEffect(() => {
    if (cats.length === 0) {
      setSelectedCatId(null);
      return;
    }
    if (!selectedCatId || !cats.some((cat) => cat.id === selectedCatId)) {
      setSelectedCatId(cats[0].id);
    }
  }, [cats, selectedCatId]);

  useEffect(() => {
    return () => {
      if (hoverClearTimerRef.current) {
        clearTimeout(hoverClearTimerRef.current);
      }
    };
  }, []);

  const positionTemplatePreview = useCallback((triggerElement: HTMLElement | null) => {
    const previewLayer = templatePreviewLayerRef.current;
    if (!previewLayer || !triggerElement) return;

    const previewLayerRect = previewLayer.getBoundingClientRect();
    const triggerRect = triggerElement.getBoundingClientRect();
    const triggerCenter = triggerRect.left - previewLayerRect.left + triggerRect.width / 2;
    const minLeft = TEMPLATE_PREVIEW_WIDTH / 2 + TEMPLATE_PREVIEW_SIDE_PADDING;
    const maxLeft = previewLayerRect.width - TEMPLATE_PREVIEW_WIDTH / 2 - TEMPLATE_PREVIEW_SIDE_PADDING;
    const clampedLeft =
      previewLayerRect.width <= TEMPLATE_PREVIEW_WIDTH + TEMPLATE_PREVIEW_SIDE_PADDING * 2
        ? previewLayerRect.width / 2
        : Math.min(Math.max(triggerCenter, minLeft), maxLeft);

    setHoveredTemplatePosition({
      left: Math.round(clampedLeft),
      top: Math.round(triggerRect.top - previewLayerRect.top),
    });
  }, []);

  const handleTemplateHoverStart = useCallback((templateId: string, triggerElement?: HTMLElement | null) => {
    if (hoverClearTimerRef.current) {
      clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }

    const resolvedTrigger = triggerElement ?? hoveredTemplateTriggerRef.current;
    if (resolvedTrigger) {
      hoveredTemplateTriggerRef.current = resolvedTrigger;
      positionTemplatePreview(resolvedTrigger);
    }

    setHoveredTemplateId(templateId);
  }, [positionTemplatePreview]);

  const handleTemplateHoverEnd = useCallback((templateId: string) => {
    hoverClearTimerRef.current = setTimeout(() => {
      setHoveredTemplateId((current) => {
        if (current !== templateId) return current;
        hoveredTemplateTriggerRef.current = null;
        setHoveredTemplatePosition(null);
        return null;
      });
      hoverClearTimerRef.current = null;
    }, 100);
  }, []);

  useEffect(() => {
    if (!hoveredTemplateId) return;

    const handleWindowResize = () => {
      positionTemplatePreview(hoveredTemplateTriggerRef.current);
    };

    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [hoveredTemplateId, positionTemplatePreview]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-5">
        <h1 className="mb-1 text-[28px] font-bold leading-[36px] text-[#1F2329]">智能体管理</h1>
        <p className="text-sm text-[#8B93A1]">管理 AI 智能体与角色配置</p>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#E6EAF0] bg-white">
        <div className="flex h-full min-h-0">
          <aside className="flex h-full w-[276px] shrink-0 flex-col border-r border-[#ECEFF3] bg-[#FFFFFF] p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-[13px] font-semibold text-[#2E3440]">智能体</span>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm text-[#6A7280] transition hover:bg-[#EEF2F7]"
                onClick={openAddMember}
              >
                +
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {cats.map((cat) => {
                const isSelected = selectedCat?.id === cat.id;
                const configCat = config?.cats[cat.id];
                const modelText = configCat?.model ?? cat.defaultModel ?? '未配置模型';
                const budgetText = formatBudgetLabel(cat.contextBudget?.maxContextTokens);
                const avatar = cat.avatar?.trim() ?? '';
                const avatarLooksLikeUrl = /^(https?:\/\/|\/)/.test(avatar);

                return (
                  <div
                    key={cat.id}
                    className={`w-full rounded-xl border px-3 py-2 transition ${
                      isSelected
                        ? 'border-[#8CB9FF] bg-[#F7FBFF] shadow-[0_0_0_1px_rgba(122,174,255,0.18)]'
                        : 'border-[#ECEFF3] bg-[#FAFBFC] hover:border-[#DCE5EF] hover:bg-[#FFFFFF]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-semibold text-white"
                        style={{ backgroundColor: cat.color?.primary ?? '#7AAEFF' }}
                      >
                        <span>{avatarLooksLikeUrl ? catInitial(cat.displayName) : avatar || catInitial(cat.displayName)}</span>
                      </div>
                      <button type="button" onClick={() => setSelectedCatId(cat.id)} className="min-w-0 flex-1 text-left">
                        <div className="truncate text-[13px] font-semibold text-[#2A303C]">{cat.displayName}</div>
                        <div className="mt-1 truncate text-[11px] text-[#9AA2B0]">
                          {modelText} · {budgetText}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditMember(cat.id)}
                        aria-label={`编辑 ${cat.displayName}`}
                        className="rounded-md px-1.5 py-1 text-[#ADB4C1] transition hover:bg-[#EEF2F7] hover:text-[#6A7280]"
                      >
                        ⋮
                      </button>
                    </div>
                  </div>
                );
              })}
              {cats.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#D6DFEA] px-3 py-4 text-[12px] text-[#98A0AD]">
                  暂无智能体数据
                </div>
              )}
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-[#EEF2F7] pb-2">
              {AGENT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs transition ${
                    activeTab === tab.id
                      ? 'bg-[#F3F6FA] font-semibold text-[#445066]'
                      : 'text-[#6F7785] hover:bg-[#F8FAFC]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => (selectedCat ? openEditMember(selectedCat.id) : openAddMember())}
                className="rounded-lg border border-[#E6EAF0] bg-white px-3 py-1.5 text-xs text-[#5F6673] shadow-sm transition hover:bg-[#F8FAFC]"
              >
                灵感模板
              </button>
            </div>

            {fetchError ? <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-500">{fetchError}</p> : null}

            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[#E7EBF1] bg-white">
              <div ref={templatePreviewLayerRef} data-testid="template-preview-layer" className="relative flex h-full flex-col">
                <div className="px-6 pt-5 text-xs text-[#B2B9C5]">
                  请输入你的智能体人格、语气、规则描述，或选择下方模板自动生成
                </div>

                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 py-6">
                  {!hoveredTemplate ? (
                    <div className="text-center text-sm text-[#A0A8B6]">将鼠标移动到下方模板卡片以预览人格定义</div>
                  ) : null}
                </div>

                <div className="border-t border-[#EEF2F7] px-6 pb-4 pt-3">
                  <div className="mb-2 text-xs text-[#8D95A3]">灵感模板</div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                    {INSPIRATION_TEMPLATES.map((template) => {
                      const isHovered = hoveredTemplateId === template.id;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          data-testid={`template-trigger-${template.id}`}
                          onMouseEnter={(event) => handleTemplateHoverStart(template.id, event.currentTarget)}
                          onMouseLeave={() => handleTemplateHoverEnd(template.id)}
                          onFocus={(event) => handleTemplateHoverStart(template.id, event.currentTarget)}
                          onBlur={() => handleTemplateHoverEnd(template.id)}
                          className={`rounded-lg border px-3 py-2 text-left transition ${
                            isHovered
                              ? 'border-[#BFD3EA] bg-[#F4F8FF]'
                              : 'border-[#E8ECF2] bg-white hover:border-[#D8E1EC] hover:bg-[#FAFCFF]'
                          }`}
                        >
                          <div className="text-[13px] font-semibold text-[#2E3542]">{template.title}</div>
                          <div className="mt-1 text-[11px] leading-5 text-[#9AA2AF]">{template.description}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-1 text-right text-[#A9B0BD]">‹ ›</div>
                </div>

                {hoveredTemplate && hoveredTemplatePosition ? (
                  <div
                    data-testid="template-hover-preview"
                    onMouseEnter={() => handleTemplateHoverStart(hoveredTemplate.id)}
                    onMouseLeave={() => handleTemplateHoverEnd(hoveredTemplate.id)}
                    className="absolute z-20 w-[400px] max-h-[300px] overflow-y-auto rounded-2xl border border-[#DEE5EF] bg-white px-7 py-6 shadow-[0_8px_24px_rgba(25,32,45,0.08)]"
                    style={{
                      left: hoveredTemplatePosition.left,
                      top: hoveredTemplatePosition.top,
                      transform: 'translate(-50%, calc(-100% - 16px))',
                    }}
                  >
                    <h3 className="text-[14px] font-semibold leading-tight text-[#1E2A3E]">
                      {selectedCat?.displayName ?? '九问Office'}
                    </h3>
                    <div className="mt-6 text-[14px] font-semibold leading-none text-[#5A6880]">人格定义 (Persona)</div>
                    <ul className="mt-6 space-y-4 text-[12px] leading-[1.45] text-[#5C6C84]">
                      {hoveredTemplate.persona.map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="mt-6 rounded-full bg-[#1F2633] px-6 py-2.5 text-[12px] font-medium text-white transition hover:bg-[#171D28]"
                    >
                      {hoveredTemplate.applyLabel}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>

      <HubCatEditor
        open={editorOpen}
        cat={editingCat ?? undefined}
        configCat={editingConfigCat}
        onClose={closeEditor}
        onSaved={handleEditorSaved}
      />
    </div>
  );
}
