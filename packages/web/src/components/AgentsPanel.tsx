'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCatData } from '@/hooks/useCatData';
import { apiFetch } from '@/utils/api-client';
import { CreateAgentModalDraft } from './CreateAgentModalDraft';
import type { ConfigData } from './config-viewer-types';
import { PromptSelectionModal } from './PromptSelectionModal';
import { useConfirm } from './useConfirm';

type AgentTabKey = 'persona' | 'collab' | 'memory' | 'preference';

const AGENT_TABS: Array<{ id: AgentTabKey; label: string }> = [
  { id: 'persona', label: '灵魂配置' },
  { id: 'collab', label: '协作配置' },
  { id: 'memory', label: '记忆配置' },
  { id: 'preference', label: '用户偏好' },
];

const TEMPLATE_PAGE_SIZE = 4;

const INSPIRATION_TEMPLATES = [
  {
    id: 'customer-service',
    title: '专业客服助手',
    description: '遵循服务规范，礼貌应答，流程引导，问题定位与转接明确。',
    category: '客服支持',
    source: '灵感模板',
    creator: '官方预置',
    createdAt: '2025-09-12 17:22:30',
    persona: [
      '身份：资深客服顾问，擅长复杂问题拆解与安抚沟通。',
      '性格：耐心克制、语气专业、表达清晰。',
      '行为：先确认诉求，再给步骤方案，必要时主动引导升级处理。',
    ],
    behavior: [
      '精准识别用户诉求与情绪波动，先安抚再给处理路径。',
      '优先提供标准流程与升级建议，避免模糊表述。',
    ],
    applyLabel: '接入模板',
  },
  {
    id: 'content-creation',
    title: '内容创作助手',
    description: '支持文案策写、标题优化、脚本创作，风格适配，结构清晰。',
    category: '文案创作',
    source: '灵感模板',
    creator: '官方预置',
    createdAt: '2025-09-12 17:22:30',
    persona: [
      '身份：资深内容创作者，擅长根据主题快速成稿。',
      '性格：创意灵活、语气温和、结构清晰。',
      '行为：聚焦目标、突出重点，给出可执行建议。',
    ],
    behavior: [
      '先明确目标受众、平台与语气，再组织内容结构。',
      '输出可直接使用的文案方案，并附带优化建议。',
    ],
    applyLabel: '接入模板',
  },
  {
    id: 'knowledge-answering',
    title: '知识解答专家',
    description: '以严谨准确为原则，条理输出，解释清楚，给出可执行建议。',
    category: '知识解答',
    source: '灵感模板',
    creator: '官方预置',
    createdAt: '2025-09-12 17:22:30',
    persona: [
      '身份：知识顾问，擅长多源信息整合与严谨解释。',
      '性格：理性克制、客观中立、注重依据。',
      '行为：先定义问题边界，再逐层解释并给出结论与风险提示。',
    ],
    behavior: [
      '先确认问题边界与上下文，再给出条理化解释。',
      '需要时补充风险、适用范围与可执行建议。',
    ],
    applyLabel: '接入模板',
  },
  {
    id: 'work-efficiency',
    title: '职场效率助手',
    description: '聚焦沟通协作、汇报提炼、流程推进，帮助提升交付效率。',
    category: '效率协作',
    source: '灵感模板',
    creator: '官方预置',
    createdAt: '2025-09-12 17:22:30',
    persona: [
      '身份：项目协作教练，擅长流程梳理与任务推进。',
      '性格：简洁务实、节奏明确、结果导向。',
      '行为：优先给行动清单，再补充沟通模板与复盘建议。',
    ],
    behavior: [
      '优先沉淀行动项、责任人和时间节点。',
      '补充可复用的汇报、纪要和复盘模板。',
    ],
    applyLabel: '接入模板',
  },
  {
    id: 'project-management',
    title: '项目管理助手',
    description: '帮助拆解目标、制定里程碑、推动协作与风险跟踪。',
    category: '项目协同',
    source: '灵感模板',
    creator: '官方预置',
    createdAt: '2025-09-12 17:22:30',
    persona: [
      '身份：项目经理与交付协调者，擅长推进计划落地。',
      '性格：稳健清晰、节奏明确、关注依赖关系。',
      '行为：先明确目标与边界，再拆解任务、识别风险并推动闭环。',
    ],
    behavior: [
      '拆解目标、建立里程碑并持续跟踪风险。',
      '围绕依赖关系和优先级推动项目闭环。',
    ],
    applyLabel: '接入模板',
  },
  {
    id: 'data-analysis',
    title: '数据分析助手',
    description: '聚焦指标拆解、数据解读、洞察归纳与结论表达。',
    category: '数据分析',
    source: '灵感模板',
    creator: '官方预置',
    createdAt: '2025-09-12 17:22:30',
    persona: [
      '身份：数据分析师，擅长从指标与样本中提炼业务洞察。',
      '性格：严谨客观、表达简洁、重视证据。',
      '行为：先确认分析目标，再整理数据、解释异常并输出结论建议。',
    ],
    behavior: [
      '先确认指标口径与样本范围，再给出分析过程。',
      '输出结论时同步说明依据、异常点和建议动作。',
    ],
    applyLabel: '接入模板',
  },
];

const TEMPLATE_PREVIEW_WIDTH = 400;
const TEMPLATE_PREVIEW_SIDE_PADDING = 24;

function buildTemplateInsertText(template: (typeof INSPIRATION_TEMPLATES)[number]): string {
  const sections = [
    {
      title: '人格定义 (Persona)',
      lines: template.persona,
    },
    {
      title: '行为准则 (Behavior)',
      lines: template.behavior,
    },
  ].filter((section) => section.lines.length > 0);

  return sections
    .map((section) => `${section.title}：\n${section.lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}`)
    .join('\n\n');
}

function buildCollabDraft(cat: {
  teamStrengths?: string;
  strengths?: string[];
  caution?: string | null;
  sessionChain?: boolean;
} | null): string {
  if (!cat) return '';

  const lines: string[] = [];
  if (cat.teamStrengths?.trim()) lines.push(`团队协作优势：${cat.teamStrengths.trim()}`);
  if (cat.strengths?.length) lines.push(`能力标签：${cat.strengths.join('、')}`);
  if (typeof cat.sessionChain === 'boolean') lines.push(`Session Chain：${cat.sessionChain ? '开启' : '关闭'}`);
  if (cat.caution?.trim()) lines.push(`协作提醒：${cat.caution.trim()}`);
  return lines.join('\n');
}

function buildTabDrafts(
  cat: {
    personality?: string;
    teamStrengths?: string;
    strengths?: string[];
    caution?: string | null;
    sessionChain?: boolean;
  } | null,
): Record<AgentTabKey, string> {
  return {
    persona: cat?.personality ?? '',
    collab: buildCollabDraft(cat),
    memory: '',
    preference: '',
  };
}

function tabPlaceholder(activeTab: AgentTabKey): string {
  switch (activeTab) {
    case 'persona':
      return '请输入你的智能体人格、语气、规则描述，或选择下方模板自动生成';
    case 'collab':
      return '请输入协作配置内容，例如分工方式、交接规则、协作边界等';
    case 'memory':
      return '请输入记忆配置内容，例如记忆策略、保留规则、摘要方式等';
    case 'preference':
      return '请输入用户偏好内容，例如输出风格、禁忌项、默认习惯等';
    default:
      return '';
  }
}

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
  const confirm = useConfirm();
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AgentTabKey>('persona');
  const [tabDrafts, setTabDrafts] = useState<Record<AgentTabKey, string>>(buildTabDrafts(null));
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [hoveredTemplateId, setHoveredTemplateId] = useState<string | null>(null);
  const [hoveredTemplatePosition, setHoveredTemplatePosition] = useState<{ left: number; top: number } | null>(null);
  const [openActionMenuCatId, setOpenActionMenuCatId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templatePage, setTemplatePage] = useState(0);
  const hoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const templatePreviewLayerRef = useRef<HTMLDivElement | null>(null);
  const hoveredTemplateTriggerRef = useRef<HTMLElement | null>(null);
  const personaTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  const fetchData = useCallback(async () => {
    setFetchError(null);
    try {
      const res = await apiFetch('/api/config');
      if (res.ok) {
        const data = (await res.json()) as { config: ConfigData };
        setConfig(data.config);
      } else {
        setFetchError('配置加载失败');
      }
    } catch {
      setFetchError('网络错误');
    }
  }, []);

  useEffect(() => {
    void fetchData();
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
  const selectedCat = useMemo(
    () => (selectedCatId ? cats.find((cat) => cat.id === selectedCatId) ?? null : cats[0] ?? null),
    [cats, selectedCatId],
  );
  const hoveredTemplate = useMemo(
    () => INSPIRATION_TEMPLATES.find((template) => template.id === hoveredTemplateId) ?? null,
    [hoveredTemplateId],
  );
  const promptSelectionItems = useMemo(
    () =>
      INSPIRATION_TEMPLATES.map((template) => ({
        id: template.id,
        title: template.title,
        category: template.category,
        source: template.source,
        creator: template.creator,
        createdAt: template.createdAt,
        summary: template.description,
        sections: [
          {
            title: '人格定义 (Persona)',
            lines: template.persona,
          },
          {
            title: '行为准则 (Behavior)',
            lines: template.behavior,
          },
        ],
        content: buildTemplateInsertText(template),
      })),
    [],
  );
  const templatePageCount = Math.max(1, Math.ceil(INSPIRATION_TEMPLATES.length / TEMPLATE_PAGE_SIZE));
  const visibleTemplates = useMemo(
    () =>
      INSPIRATION_TEMPLATES.slice(
        templatePage * TEMPLATE_PAGE_SIZE,
        templatePage * TEMPLATE_PAGE_SIZE + TEMPLATE_PAGE_SIZE,
      ),
    [templatePage],
  );
  const activeDraft = tabDrafts[activeTab] ?? '';
  const isPersonaTab = activeTab === 'persona';
  const hasDraftContent = activeDraft.trim().length > 0;
  const showTemplateUI = isPersonaTab && !hasDraftContent;

  useEffect(() => {
    setTabDrafts(buildTabDrafts(selectedCat));
  }, [selectedCat]);

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

  const handleTemplateApply = useCallback((template: (typeof INSPIRATION_TEMPLATES)[number]) => {
    const templateText = buildTemplateInsertText(template);
    setTabDrafts((current) => {
      const activeDraft = current[activeTab];
      return {
        ...current,
        [activeTab]: activeDraft.trim() ? `${activeDraft.trimEnd()}\n\n${templateText}` : templateText,
      };
    });
    personaTextareaRef.current?.focus();
  }, [activeTab]);
  const handleTemplateModalConfirm = useCallback(
    (item: { id: string }) => {
      const template = INSPIRATION_TEMPLATES.find((entry) => entry.id === item.id);
      if (!template) return;
      handleTemplateApply(template);
      setTemplateModalOpen(false);
    },
    [handleTemplateApply],
  );
  const handleTemplatePageChange = useCallback((nextPage: number) => {
    setHoveredTemplateId(null);
    setHoveredTemplatePosition(null);
    hoveredTemplateTriggerRef.current = null;
    setTemplatePage(nextPage);
  }, []);

  const toggleActionMenu = useCallback((catId: string) => {
    setOpenActionMenuCatId((current) => (current === catId ? null : catId));
  }, []);

  const handleDeleteMember = useCallback(
    async (catId: string) => {
      const cat = cats.find((item) => item.id === catId);
      if (!cat) return;

      setOpenActionMenuCatId(null);
      const ok = await confirm({
        title: '删除确认',
        message: `确认删除成员「${cat.displayName}」吗？此操作不可撤销。`,
        variant: 'danger',
        confirmLabel: '删除',
      });
      if (!ok) return;

      setFetchError(null);
      try {
        const res = await apiFetch(`/api/cats/${cat.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          setFetchError((payload.error as string) ?? `删除失败 (${res.status})`);
          return;
        }
        await Promise.all([fetchData(), refresh()]);
      } catch {
        setFetchError('删除失败');
      }
    },
    [cats, confirm, fetchData, refresh],
  );

  useEffect(() => {
    if (!openActionMenuCatId) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setOpenActionMenuCatId(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenActionMenuCatId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openActionMenuCatId]);

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

  useEffect(() => {
    if (showTemplateUI) return;
    setTemplateModalOpen(false);
    setHoveredTemplateId(null);
    setHoveredTemplatePosition(null);
    hoveredTemplateTriggerRef.current = null;
  }, [showTemplateUI]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-5">
        <h1 className="mb-1 text-[28px] font-bold leading-[36px] text-[#1F2329]">智能体管理</h1>
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
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto  overflow-y-hidden pr-1">
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
                    className={`relative w-full overflow-visible rounded-xl border px-3 py-2 transition ${
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
                      <div ref={openActionMenuCatId === cat.id ? actionMenuRef : null} className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleActionMenu(cat.id)}
                          aria-label={`操作 ${cat.displayName}`}
                          aria-haspopup="menu"
                          aria-expanded={openActionMenuCatId === cat.id}
                          className="rounded-md px-1.5 py-1 text-[#ADB4C1] transition hover:bg-[#EEF2F7] hover:text-[#6A7280]"
                        >
                          ⋮
                        </button>

                        {openActionMenuCatId === cat.id ? (
                          <div
                            role="menu"
                            data-testid={`agent-action-menu-${cat.id}`}
                            className="absolute right-0 top-full z-30 mt-2 w-20 rounded-xl border border-[#E6EAF0] bg-white p-2 shadow-[0_10px_30px_rgba(15,23,42,0.12)]"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenActionMenuCatId(null);
                                openEditMember(cat.id);
                              }}
                              className="flex h-8 w-full items-center rounded-lg px-3 text-left text-[12px] text-[#334155] transition hover:bg-[#F4F7FB]"
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => setOpenActionMenuCatId(null)}
                              className="flex h-8 w-full items-center rounded-lg px-3 text-left text-[12px] text-[#94A3B8] transition hover:bg-[#F4F7FB]"
                            >
                              复制
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void handleDeleteMember(cat.id)}
                              className="flex h-8 w-full items-center rounded-lg px-3 text-left text-[12px] text-[#DC2626] transition hover:bg-[#FEF2F2]"
                            >
                              删除
                            </button>
                          </div>
                        ) : null}
                      </div>
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
                  data-testid={`agent-tab-${tab.id}`}
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
 
            </div>

            {fetchError ? <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-500">{fetchError}</p> : null}

            <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-white flex flex-col">
              <div className="flex w-full justify-end gap-2">
                <button
                  type="button"
                  data-testid="agent-clear-button"
                  onClick={() =>
                    setTabDrafts((current) => ({
                      ...current,
                      [activeTab]: '',
                    }))
                  }
                  className="rounded-lg border border-[#E6EAF0] bg-white px-3 py-1.5 text-xs text-[#5F6673] shadow-sm transition hover:bg-[#F8FAFC]"
                >
                  清除
                </button>
                {showTemplateUI ? (
                  <button
                    type="button"
                    data-testid="agent-template-button"
                    onClick={() => setTemplateModalOpen(true)}
                    className="rounded-lg border border-[#E6EAF0] bg-white px-3 py-1.5 text-xs text-[#5F6673] shadow-sm transition hover:bg-[#F8FAFC]"
                  >
                    灵感模板
                  </button>
                ) : null}
              </div>
              <div ref={templatePreviewLayerRef} data-testid="template-preview-layer" className="relative flex h-full flex-col">
                <div className="flex min-h-0 flex-1 overflow-hidden px-12 py-1">
                    <textarea
                      ref={personaTextareaRef}
                      value={activeDraft}
                      onChange={(event) =>
                        setTabDrafts((current) => ({
                          ...current,
                          [activeTab]: event.target.value,
                        }))
                      }
                      placeholder={tabPlaceholder(activeTab)}
                      className="w-full min-h-0 flex-1 resize-none text-[12px] leading-7 text-[#334155] outline-none transition placeholder:text-[#A0A8B6]"
                      data-testid="agent-tab-textarea"
                    />
                </div>

                {showTemplateUI ? (
                  <div className="shrink-0 px-6 pb-2 pt-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div data-testid="agent-template-section-title" className="text-xs text-[#8D95A3]">灵感模板</div>
                      {templatePageCount > 1 ? (
                        <div className="flex items-center gap-2 text-[#A9B0BD]">
                          <button
                            type="button"
                            onClick={() => handleTemplatePageChange(templatePage - 1)}
                            disabled={templatePage === 0}
                            className="rounded-md px-2 py-1 text-sm transition enabled:hover:bg-[#F4F7FB] disabled:cursor-not-allowed disabled:opacity-40"
                            data-testid="templates-prev-page"
                            aria-label="上一页模板"
                          >
                            ‹
                          </button>
                          <span className="text-[11px] text-[#A9B0BD]">
                            {templatePage + 1}/{templatePageCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleTemplatePageChange(templatePage + 1)}
                            disabled={templatePage >= templatePageCount - 1}
                            className="rounded-md px-2 py-1 text-sm transition enabled:hover:bg-[#F4F7FB] disabled:cursor-not-allowed disabled:opacity-40"
                            data-testid="templates-next-page"
                            aria-label="下一页模板"
                          >
                            ›
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                      {visibleTemplates.map((template) => {
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
                            className={`h-[98px] rounded-lg border px-3 py-2 text-left transition ${
                              isHovered
                                ? 'border-[#BFD3EA] bg-[#F4F8FF]'
                                : 'border-[#E8ECF2] bg-white hover:border-[#D8E1EC] hover:bg-[#FAFCFF]'
                            }`}
                          >
                            <div className="text-[13px] font-semibold text-[#2E3542]">{template.title}</div>
                            <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#9AA2AF]">{template.description}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {showTemplateUI && hoveredTemplate && hoveredTemplatePosition ? (
                  <div
                    data-testid="template-hover-preview"
                    onMouseEnter={() => handleTemplateHoverStart(hoveredTemplate.id)}
                    onMouseLeave={() => handleTemplateHoverEnd(hoveredTemplate.id)}
                    className="absolute z-20 w-[400px]"
                    style={{
                      left: hoveredTemplatePosition.left,
                      top: hoveredTemplatePosition.top,
                      transform: 'translate(-50%, calc(-100% - 16px))',
                    }}
                  >
                    <div className="relative flex h-[300px] flex-col overflow-hidden rounded-[8px] border border-[#DEE5EF] bg-white px-7 py-6 shadow-[0_8px_24px_rgba(25,32,45,0.08)]">
                      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                        <h3 className="text-[14px] font-semibold leading-tight text-[#1E2A3E]">
                          {selectedCat?.displayName ?? '九问Office'}
                        </h3>
                        <div className="mt-6 text-[14px] font-semibold leading-none text-[#5A6880]">人格定义 (Persona)</div>
                        <ul className="mt-6 space-y-4 text-[12px] leading-[1.45] text-[#5C6C84]">
                          {hoveredTemplate.persona.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex justify-end pt-4">
                        <button
                          type="button"
                          onClick={() => handleTemplateApply(hoveredTemplate)}
                          className="rounded-full bg-[#1F2633] px-6 py-2.5 text-[12px] font-medium text-white transition hover:bg-[#171D28]"
                        >
                          插入模板
                        </button>
                      </div>
                    </div>
                    <div
                      aria-hidden="true"
                      data-testid="template-hover-preview-tail"
                      className="pointer-events-none absolute left-1/2 top-[calc(100%-8px)] h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-[#DEE5EF] bg-white"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>

      <CreateAgentModalDraft
        open={editorOpen}
        cat={editingCat ?? undefined}
        name={editingCat?.name ?? editingCat?.displayName}
        description={editingCat?.roleDescription}
        selectedModelId={
          editingCat?.accountRef && editingCat.defaultModel ? `${editingCat.accountRef}::${editingCat.defaultModel}` : null
        }
        title={editingCatId ? '编辑智能体' : '创建智能体'}
        onClose={closeEditor}
        onSaved={handleEditorSaved}
      />
      <PromptSelectionModal
        open={showTemplateUI && templateModalOpen}
        items={promptSelectionItems}
        title="灵魂模板"
        searchPlaceholder="输入关键字搜索"
        cancelLabel="取消"
        confirmLabel="插入"
        initialSelectedId={hoveredTemplateId ?? promptSelectionItems[0]?.id ?? null}
        onClose={() => setTemplateModalOpen(false)}
        onConfirm={handleTemplateModalConfirm}
      />
    </div>
  );
}
