'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCatData } from '@/hooks/useCatData';
import { apiFetch } from '@/utils/api-client';
import { CreateAgentModalDraft } from './CreateAgentModalDraft';
import type { ConfigData } from './config-viewer-types';
import { PromptSelectionModal } from './PromptSelectionModal';
import { useConfirm } from './useConfirm';

type AgentTabKey = 'persona' | 'collab';

type CollabDraftFields = {
  teamStrengths: string;
  strengths: string[];
  caution: string | null;
  sessionChain: boolean;
};

const AGENT_TABS: Array<{ id: AgentTabKey; label: string }> = [
  { id: 'persona', label: '灵魂配置' },
  { id: 'collab', label: '协作配置' },
];

const TEMPLATE_PAGE_SIZE = 4;
const AUTOSAVE_DELAY_MS = 700;

type InspirationTemplate = {
  id: string;
  name: string;
  description: string;
  soulTemplate: {
    persona: string[];
    behavior: string[];
  };
};

const TEMPLATE_MODAL_CATEGORY = '灵魂模板';
const TEMPLATE_MODAL_SOURCE = '灵魂模板';
const TEMPLATE_MODAL_CREATOR = '官方预置';
const TEMPLATE_MODAL_CREATED_AT = '2025-09-12 17:22:30';

const FALLBACK_TEMPLATES: InspirationTemplate[] = [
  {
    id: 'customer-service',
    name: '专业客服助手',
    description: '遵循服务规范，礼貌应答，流程引导，问题定位与转接明确。',
    soulTemplate: {
      persona: [
        '身份：资深客服顾问，擅长复杂问题拆解与安抚沟通。',
        '性格：耐心克制、语气专业、表达清晰。',
        '行为：先确认诉求，再给步骤方案，必要时主动引导升级处理。',
      ],
      behavior: ['精准识别用户诉求与情绪波动，先安抚再给处理路径。', '优先提供标准流程与升级建议，避免模糊表述。'],
    },
  },
  {
    id: 'content-creation',
    name: '内容创作助手',
    description: '支持文案策写、标题优化、脚本创作，风格适配，结构清晰。',
    soulTemplate: {
      persona: [
        '身份：资深内容创作者，擅长根据主题快速成稿。',
        '性格：创意灵活、语气温和、结构清晰。',
        '行为：聚焦目标、突出重点，给出可执行建议。',
      ],
      behavior: ['先明确目标受众、平台与语气，再组织内容结构。', '输出可直接使用的文案方案，并附带优化建议。'],
    },
  },
  {
    id: 'knowledge-answering',
    name: '知识解答专家',
    description: '以严谨准确为原则，条理输出，解释清楚，给出可执行建议。',
    soulTemplate: {
      persona: [
        '身份：知识顾问，擅长多源信息整合与严谨解释。',
        '性格：理性克制、客观中立、注重依据。',
        '行为：先定义问题边界，再逐层解释并给出结论与风险提示。',
      ],
      behavior: ['先确认问题边界与上下文，再给出条理化解释。', '需要时补充风险、适用范围与可执行建议。'],
    },
  },
  {
    id: 'work-efficiency',
    name: '职场效率助手',
    description: '聚焦沟通协作、汇报提炼、流程推进，帮助提升交付效率。',
    soulTemplate: {
      persona: [
        '身份：项目协作教练，擅长流程梳理与任务推进。',
        '性格：简洁务实、节奏明确、结果导向。',
        '行为：优先给行动清单，再补充沟通模板与复盘建议。',
      ],
      behavior: ['优先沉淀行动项、责任人和时间节点。', '补充可复用的汇报、纪要和复盘模板。'],
    },
  },
  {
    id: 'project-management',
    name: '项目管理助手',
    description: '帮助拆解目标、制定里程碑、推动协作与风险跟踪。',
    soulTemplate: {
      persona: [
        '身份：项目经理与交付协调者，擅长推进计划落地。',
        '性格：稳健清晰、节奏明确、关注依赖关系。',
        '行为：先明确目标与边界，再拆解任务、识别风险并推动闭环。',
      ],
      behavior: ['拆解目标、建立里程碑并持续跟踪风险。', '围绕依赖关系和优先级推动项目闭环。'],
    },
  },
  {
    id: 'data-analysis',
    name: '数据分析助手',
    description: '聚焦指标拆解、数据解读、洞察归纳与结论表达。',
    soulTemplate: {
      persona: [
        '身份：数据分析师，擅长从指标与样本中提炼业务洞察。',
        '性格：严谨客观、表达简洁、重视证据。',
        '行为：先确认分析目标，再整理数据、解释异常并输出结论建议。',
      ],
      behavior: ['先确认指标口径与样本范围，再给出分析过程。', '输出结论时同步说明依据、异常点和建议动作。'],
    },
  },
];

const TEMPLATE_PREVIEW_WIDTH = 400;
const TEMPLATE_PREVIEW_SIDE_PADDING = 24;
const ACTION_MENU_ITEM_CLASS =
  'flex h-8 w-full items-center rounded-[var(--radius-sm)] px-3 text-left text-[12px] transition hover:bg-[var(--surface-card-muted)]';

function buildTemplateInsertText(template: InspirationTemplate): string {
  const sections = [
    {
      title: '人格定义 (Persona)',
      lines: template.soulTemplate.persona,
    },
    {
      title: '行为准则 (Behavior)',
      lines: template.soulTemplate.behavior,
    },
  ].filter((section) => section.lines.length > 0);

  return sections
    .map((section) => `${section.title}：\n${section.lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}`)
    .join('\n\n');
}

function buildCollabDraft(
  cat: {
    teamStrengths?: string;
    strengths?: string[];
    caution?: string | null;
    sessionChain?: boolean;
  } | null,
): string {
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
  };
}

function parseStrengthTags(raw: string): string[] {
  return raw
    .split(/[、,\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseCollabDraft(draft: string): CollabDraftFields {
  const next: CollabDraftFields = {
    teamStrengths: '',
    strengths: [],
    caution: null,
    sessionChain: true,
  };

  for (const rawLine of draft.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('团队协作优势：')) {
      next.teamStrengths = line.slice('团队协作优势：'.length).trim();
      continue;
    }
    if (line.startsWith('能力标签：')) {
      next.strengths = parseStrengthTags(line.slice('能力标签：'.length));
      continue;
    }
    if (line.startsWith('Session Chain：')) {
      const value = line.slice('Session Chain：'.length).trim();
      if (value === '开启') next.sessionChain = true;
      if (value === '关闭') next.sessionChain = false;
      continue;
    }
    if (line.startsWith('协作提醒：')) {
      const value = line.slice('协作提醒：'.length).trim();
      next.caution = value || null;
    }
  }

  return next;
}

function buildAutosavePayload(tab: AgentTabKey, draft: string): Record<string, unknown> {
  if (tab === 'persona') {
    return { personality: draft };
  }

  const parsed = parseCollabDraft(draft);
  return {
    teamStrengths: parsed.teamStrengths,
    strengths: parsed.strengths,
    sessionChain: parsed.sessionChain,
    caution: parsed.caution,
  };
}

function tabPlaceholder(activeTab: AgentTabKey): string {
  switch (activeTab) {
    case 'persona':
      return '请输入你的智能体人格、语气、规则描述，或选择下方模板自动生成';
    case 'collab':
      return '请输入协作配置内容，例如分工方式、交接规则、协作边界等';
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
  const [inspirationTemplates, setInspirationTemplates] = useState<InspirationTemplate[]>(FALLBACK_TEMPLATES);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const hoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const templatePreviewLayerRef = useRef<HTMLDivElement | null>(null);
  const hoveredTemplateTriggerRef = useRef<HTMLElement | null>(null);
  const personaTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const selectedCatIdRef = useRef<string | null>(null);
  const activeTabRef = useRef<AgentTabKey>('persona');
  const tabDraftsRef = useRef<Record<AgentTabKey, string>>(buildTabDrafts(null));
  const lastSavedDraftsRef = useRef<Record<string, Record<AgentTabKey, string>>>({});
  const saveQueueRef = useRef<{ catId: string; tab: AgentTabKey; draft: string } | null>(null);
  const saveLoopPromiseRef = useRef<Promise<void> | null>(null);
  const previousSelectedCatIdRef = useRef<string | null>(null);

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

  // 从后端加载灵魂模板
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/soul-templates')
      .then(async (res) => {
        if (!res.ok) throw new Error(`加载失败 (${res.status})`);
        const data = (await res.json()) as { templates?: InspirationTemplate[] };
        if (!cancelled && data.templates) {
          setInspirationTemplates(data.templates);
        }
      })
      .catch((err) => {
        console.warn('[AgentsPanel] 模板加载失败，使用降级数据', err);
      })
      .finally(() => {
        if (!cancelled) {
          setTemplatesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    () => (selectedCatId ? (cats.find((cat) => cat.id === selectedCatId) ?? null) : (cats[0] ?? null)),
    [cats, selectedCatId],
  );
  const hoveredTemplate = useMemo(
    () => inspirationTemplates.find((template) => template.id === hoveredTemplateId) ?? null,
    [hoveredTemplateId],
  );
  const promptSelectionItems = useMemo(
    () =>
      inspirationTemplates.map((template) => ({
        id: template.id,
        title: template.name,
        category: TEMPLATE_MODAL_CATEGORY,
        source: TEMPLATE_MODAL_SOURCE,
        creator: TEMPLATE_MODAL_CREATOR,
        createdAt: TEMPLATE_MODAL_CREATED_AT,
        summary: template.description,
        sections: [
          {
            title: '人格定义 (Persona)',
            lines: template.soulTemplate.persona,
          },
          {
            title: '行为准则 (Behavior)',
            lines: template.soulTemplate.behavior,
          },
        ],
        content: buildTemplateInsertText(template),
      })),
    [inspirationTemplates],
  );
  const templatePageCount = Math.max(1, Math.ceil(inspirationTemplates.length / TEMPLATE_PAGE_SIZE));
  const visibleTemplates = useMemo(
    () =>
      inspirationTemplates.slice(
        templatePage * TEMPLATE_PAGE_SIZE,
        templatePage * TEMPLATE_PAGE_SIZE + TEMPLATE_PAGE_SIZE,
      ),
    [templatePage, inspirationTemplates],
  );
  const activeDraft = tabDrafts[activeTab] ?? '';
  const isPersonaTab = activeTab === 'persona';
  const hasDraftContent = activeDraft.trim().length > 0;
  const showTemplateUI = isPersonaTab && !hasDraftContent;

  useEffect(() => {
    selectedCatIdRef.current = selectedCat?.id ?? null;
  }, [selectedCat?.id]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    tabDraftsRef.current = tabDrafts;
  }, [tabDrafts]);

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
    if (!selectedCat?.id) return;
    if (previousSelectedCatIdRef.current === selectedCat.id) return;
    const nextDrafts = buildTabDrafts(selectedCat);
    previousSelectedCatIdRef.current = selectedCat.id;
    lastSavedDraftsRef.current[selectedCat.id] = nextDrafts;
    setTabDrafts(nextDrafts);
  }, [selectedCat?.id, selectedCat]);

  const queueAutosave = useCallback(
    async (catId: string, tab: AgentTabKey, draft: string) => {
      saveQueueRef.current = { catId, tab, draft };
      if (saveLoopPromiseRef.current) {
        await saveLoopPromiseRef.current;
        return;
      }

      saveLoopPromiseRef.current = (async () => {
        while (saveQueueRef.current) {
          const nextSave = saveQueueRef.current;
          saveQueueRef.current = null;
          try {
            const res = await apiFetch(`/api/cats/${nextSave.catId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(buildAutosavePayload(nextSave.tab, nextSave.draft)),
            });
            if (!res.ok) {
              const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
              setFetchError((payload.error as string) ?? `保存失败 (${res.status})`);
              continue;
            }

            setFetchError(null);
            const savedDrafts = lastSavedDraftsRef.current[nextSave.catId] ?? buildTabDrafts(null);
            lastSavedDraftsRef.current[nextSave.catId] = {
              ...savedDrafts,
              [nextSave.tab]: nextSave.draft,
            };
            await refresh();
          } catch {
            setFetchError('保存失败');
          }
        }
      })().finally(() => {
        saveLoopPromiseRef.current = null;
      });

      await saveLoopPromiseRef.current;
    },
    [refresh],
  );

  const flushAutosave = useCallback(async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    const catId = selectedCatIdRef.current;
    const tab = activeTabRef.current;
    if (!catId) return;

    const draft = tabDraftsRef.current[tab] ?? '';
    const savedDraft = lastSavedDraftsRef.current[catId]?.[tab] ?? '';
    if (draft === savedDraft) return;
    await queueAutosave(catId, tab, draft);
  }, [queueAutosave]);

  useEffect(() => {
    return () => {
      if (hoverClearTimerRef.current) {
        clearTimeout(hoverClearTimerRef.current);
      }
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      const catId = selectedCatIdRef.current;
      const tab = activeTabRef.current;
      if (!catId) return;
      const draft = tabDraftsRef.current[tab] ?? '';
      const savedDraft = lastSavedDraftsRef.current[catId]?.[tab] ?? '';
      if (draft !== savedDraft) {
        void queueAutosave(catId, tab, draft);
      }
    };
  }, [queueAutosave]);

  useEffect(() => {
    const catId = selectedCat?.id;
    if (!catId) return;
    const savedDraft = lastSavedDraftsRef.current[catId]?.[activeTab] ?? '';
    if (activeDraft === savedDraft) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void queueAutosave(catId, activeTab, activeDraft);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [activeDraft, activeTab, queueAutosave, selectedCat?.id]);

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

  const handleTemplateHoverStart = useCallback(
    (templateId: string, triggerElement?: HTMLElement | null) => {
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
    },
    [positionTemplatePreview],
  );

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

  const handleTemplateApply = useCallback(
    (template: InspirationTemplate) => {
      const templateText = buildTemplateInsertText(template);
      setTabDrafts((current) => {
        const activeDraft = current[activeTab];
        return {
          ...current,
          [activeTab]: activeDraft.trim() ? `${activeDraft.trimEnd()}\n\n${templateText}` : templateText,
        };
      });
      personaTextareaRef.current?.focus();
    },
    [activeTab],
  );
  const handleTemplateModalConfirm = useCallback(
    (item: { id: string }) => {
      const template = inspirationTemplates.find((entry) => entry.id === item.id);
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
    <div className="ui-page-shell gap-4">
      <div className="ui-page-header">
        <h1 className="ui-page-title">智能体管理</h1>
      </div>

      <div className="ui-panel min-h-0 flex-1 overflow-hidden" data-testid="agents-panel-surface">
        <div className="flex h-full min-h-0">
          <aside className="bg-white flex h-full w-[276px] shrink-0 flex-col p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">智能体</span>
              <button
                type="button"
                data-testid="agent-add-button"
                className="ui-icon-button h-8 w-8 rounded-[var(--radius-sm)] text-sm"
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
                const isPlatformPreset = cat.source !== 'runtime';

                return (
                  <div
                    key={cat.id}
                    data-testid={`agent-card-${cat.id}`}
                    className={`relative w-full overflow-visible rounded-[var(--radius-lg)] border px-3 py-2 transition ${
                      isSelected
                        ? 'border-transparent bg-[var(--surface-selected)]'
                        : 'border-[var(--border-default)] bg-[var(--surface-card-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-card)]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-semibold text-white"
                        style={{ backgroundColor: cat.color?.primary ?? '#7AAEFF' }}
                      >
                        <span>
                          {avatarLooksLikeUrl ? catInitial(cat.displayName) : avatar || catInitial(cat.displayName)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void flushAutosave().finally(() => {
                            setSelectedCatId(cat.id);
                          });
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex min-w-0 items-center gap-1">
                          <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
                            {cat.displayName}
                          </span>
                          {isPlatformPreset ? (
                            <span className="inline-flex h-[18px] shrink-0 items-center rounded-[2px] bg-[rgba(230,230,230,1)] px-1 text-[12px] text-[rgba(25,25,25,1)]">
                              平台预置
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
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
                          className="ui-icon-button h-8 w-8 rounded-[var(--radius-sm)]"
                        >
                          ⋮
                        </button>

                        {openActionMenuCatId === cat.id ? (
                          <div
                            role="menu"
                            data-testid={`agent-action-menu-${cat.id}`}
                            className="absolute right-0 top-full z-30 mt-2 w-24 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-panel)] p-2 shadow-lg"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenActionMenuCatId(null);
                                openEditMember(cat.id);
                              }}
                              className={`${ACTION_MENU_ITEM_CLASS} text-[var(--text-primary)]`}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => setOpenActionMenuCatId(null)}
                              className={`${ACTION_MENU_ITEM_CLASS} text-[var(--text-muted)]`}
                            >
                              复制
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void handleDeleteMember(cat.id)}
                              className={`${ACTION_MENU_ITEM_CLASS} text-[var(--state-error-text)] hover:bg-[var(--state-error-surface)]`}
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
                <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] px-3 py-4 text-[12px] text-[var(--text-muted)]">
                  暂无智能体数据
                </div>
              )}
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col border border-[#e5e7eb] bg-[var(--surface-panel)] p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-[var(--border-soft)] pb-2">
              {AGENT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    void flushAutosave().finally(() => {
                      setActiveTab(tab.id);
                    });
                  }}
                  data-testid={`agent-tab-${tab.id}`}
                  className={`ui-chip rounded-[var(--radius-sm)] px-3 py-1.5 text-xs transition ${
                    activeTab === tab.id ? 'ui-chip-active font-semibold' : 'hover:bg-[var(--surface-card-muted)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <div className="flex-1" />
            </div>

            {fetchError ? (
              <p className="ui-status-error mb-2 rounded-[var(--radius-md)] px-3 py-2 text-sm">{fetchError}</p>
            ) : null}

            <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface-panel)] flex flex-col">
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
                  className="ui-button-secondary rounded-[var(--radius-sm)] px-3 py-1.5 text-xs shadow-none"
                >
                  清除
                </button>
                {showTemplateUI ? (
                  <button
                    type="button"
                    data-testid="agent-template-button"
                    onClick={() => setTemplateModalOpen(true)}
                    className="ui-button-secondary rounded-[var(--radius-sm)] px-3 py-1.5 text-xs shadow-none"
                  >
                    灵魂模板
                  </button>
                ) : null}
              </div>
              <div
                ref={templatePreviewLayerRef}
                data-testid="template-preview-layer"
                className="relative flex h-full flex-col"
              >
                <div className="flex min-h-0 flex-1 overflow-hidden px-12 py-1">
                  <div className="border-none ui-input-shell flex w-full flex-1 rounded-[var(--radius-xl)] px-4 py-3">
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
                      className="w-full min-h-0 flex-1 resize-none bg-transparent text-[12px] leading-7 text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)]"
                      data-testid="agent-tab-textarea"
                    />
                  </div>
                </div>

                {showTemplateUI ? (
                  <div className="shrink-0 px-6 pb-2 pt-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div data-testid="agent-template-section-title" className="text-xs text-[var(--text-muted)]">
                        灵魂模板
                      </div>
                      {templatePageCount > 1 ? (
                        <div className="flex items-center gap-2 text-[var(--text-muted)]">
                          <button
                            type="button"
                            onClick={() => handleTemplatePageChange(templatePage - 1)}
                            disabled={templatePage === 0}
                            className="ui-icon-button h-8 w-8 text-sm enabled:hover:bg-[var(--surface-card-muted)] disabled:cursor-not-allowed disabled:opacity-40"
                            data-testid="templates-prev-page"
                            aria-label="上一页模板"
                          >
                            ‹
                          </button>
                          <span className="text-[11px] text-[var(--text-muted)]">
                            {templatePage + 1}/{templatePageCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleTemplatePageChange(templatePage + 1)}
                            disabled={templatePage >= templatePageCount - 1}
                            className="ui-icon-button h-8 w-8 text-sm enabled:hover:bg-[var(--surface-card-muted)] disabled:cursor-not-allowed disabled:opacity-40"
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
                            className={`h-[98px] rounded-[var(--radius-md)] border px-3 py-2 text-left transition ${
                              isHovered
                                ? 'border-[var(--border-accent)] bg-[var(--surface-selected)]'
                                : 'border-[var(--border-default)] bg-[var(--surface-panel)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-card-muted)]'
                            }`}
                          >
                            <div className="text-[13px] font-semibold text-[var(--text-primary)]">{template.name}</div>
                            <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--text-muted)]">
                              {template.description}
                            </div>
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
                    <div className="relative flex h-[300px] flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-panel)] px-7 py-6 shadow-lg">
                      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                        <h3 className="text-[14px] font-semibold leading-tight text-[var(--text-primary)]">
                          {selectedCat?.displayName ?? '九问Office'}
                        </h3>
                        <div className="mt-6 text-[14px] font-semibold leading-none text-[var(--text-secondary)]">
                          人格定义 (Persona)
                        </div>
                        <ul className="mt-6 space-y-4 text-[12px] leading-[1.45] text-[var(--text-secondary)]">
                          {hoveredTemplate.soulTemplate.persona.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex justify-end pt-4">
                        <button
                          type="button"
                          onClick={() => handleTemplateApply(hoveredTemplate)}
                          className="ui-button-primary px-6 py-2.5 text-[12px]"
                        >
                          插入模板
                        </button>
                      </div>
                    </div>
                    <div
                      aria-hidden="true"
                      data-testid="template-hover-preview-tail"
                      className="pointer-events-none absolute left-1/2 top-[calc(100%-8px)] h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-[var(--border-default)] bg-[var(--surface-panel)]"
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
          editingCat?.accountRef && editingCat.defaultModel
            ? `${editingCat.accountRef}::${editingCat.defaultModel}`
            : null
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
