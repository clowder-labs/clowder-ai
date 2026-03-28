'use client';

import { useState } from 'react';
import { HubCapabilityTab } from './HubCapabilityTab';
import { HubSkillsTab } from './HubSkillsTab';

const INSTALLED = '已安装';
const SKILL_PLAZA = '技能广场';
const IMPORT_SKILL = '导入';

export function SkillsPanel() {
  const [activeTab, setActiveTab] = useState<'installed' | 'plaza'>('installed');

  return (
    <div className="ui-page-shell gap-4">
      <div className="ui-page-header-inline items-start">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setActiveTab('installed')}
              className={`ui-tab-trigger ${activeTab === 'installed' ? 'ui-tab-trigger-active' : ''}`}
            >
              {INSTALLED}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('plaza')}
              className={`ui-tab-trigger ${activeTab === 'plaza' ? 'ui-tab-trigger-active' : ''}`}
            >
              {SKILL_PLAZA}
            </button>
          </div>
          <div
            className="ui-tab-indicator w-[58px]"
            style={{ transform: activeTab === 'plaza' ? 'translateX(110px)' : 'translateX(0)' }}
          />
        </div>
        <button type="button" className="ui-button-secondary">
          {IMPORT_SKILL}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="ui-panel p-4">{activeTab === 'plaza' ? <HubSkillsTab /> : <HubCapabilityTab />}</div>
      </div>
    </div>
  );
}
