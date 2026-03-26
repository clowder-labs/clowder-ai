'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCatData } from '@/hooks/useCatData';
import { apiFetch } from '@/utils/api-client';
import type { ConfigData } from './config-viewer-types';
import { HubCatEditor } from './HubCatEditor';
import { HubCoCreatorOverviewCard, HubMemberOverviewCard, HubOverviewToolbar } from './HubMemberOverviewCard';

export function AgentsPanel() {
  const { cats, refresh } = useCatData();
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [togglingCatId, setTogglingCatId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

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

  const handleToggleAvailability = useCallback(
    async (catId: string) => {
      setTogglingCatId(catId);
      setFetchError(null);
      try {
        const res = await apiFetch(`/api/cats/${catId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ available: true }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          setFetchError((payload.error as string) ?? `成员状态切换失败 (${res.status})`);
          return;
        }
        await Promise.all([fetchData(), refresh()]);
      } catch {
        setFetchError('成员状态切换失败');
      } finally {
        setTogglingCatId(null);
      }
    },
    [fetchData, refresh],
  );

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

  const openCoCreatorEditor = useCallback(() => {
    // TODO: Open co-creator editor
  }, []);

  const editingCat = editingCatId ? cats.find((c) => c.id === editingCatId) : null;
  const editingConfigCat = editingCatId && config ? config.cats[editingCatId] : undefined;

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">智能体管理</h1>
        <p className="text-sm text-gray-500">管理 AI 成员及其配置</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {fetchError && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-4">{fetchError}</p>}

        {config ? (
          <div className="space-y-4">
            <HubOverviewToolbar onAddMember={openAddMember} />
            {config.coCreator ? (
              <HubCoCreatorOverviewCard coCreator={config.coCreator} onEdit={openCoCreatorEditor} />
            ) : null}
            <div className="space-y-3">
              {cats.map((catData) => (
                <HubMemberOverviewCard
                  key={catData.id}
                  cat={catData}
                  configCat={config.cats[catData.id]}
                  onEdit={() => openEditMember(catData.id)}
                  onToggleAvailability={() => handleToggleAvailability(catData.id)}
                  togglingAvailability={togglingCatId === catData.id}
                />
              ))}
            </div>
            <p className="text-[13px] text-[#B59A88]">点击任意卡片进入成员配置 →</p>
            {cats.length === 0 && <p className="text-sm text-gray-400">未找到成员配置数据</p>}
          </div>
        ) : !fetchError ? (
          <p className="text-sm text-gray-400">加载中...</p>
        ) : null}
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
