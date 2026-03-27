'use client';

import { HubProviderProfilesTab } from './HubProviderProfilesTab';

export function ModelsPanel() {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">模型管理</h1>
        <p className="text-sm text-gray-500">管理 AI 模型账号配置</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <HubProviderProfilesTab />
      </div>
    </div>
  );
}
