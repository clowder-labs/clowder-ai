'use client';

import { HubSkillsTab } from './HubSkillsTab';

export function SkillsPanel() {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">技能管理</h1>
        <p className="text-sm text-gray-500">管理 SkillHub 技能</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <HubSkillsTab />
      </div>
    </div>
  );
}
