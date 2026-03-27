'use client';

import { useState } from 'react';
import { HubCapabilityTab } from './HubCapabilityTab';
import { HubSkillsTab } from './HubSkillsTab';

const INSTALLED = '\u5df2\u5b89\u88c5';
const SKILL_PLAZA = '\u6280\u80fd\u5e7f\u573a';
const IMPORT_SKILL = '\u5bfc\u5165';

export function SkillsPanel() {
  const [activeTab, setActiveTab] = useState<'installed' | 'plaza'>('installed');

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 bg-[#FFFFFF]">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setActiveTab('installed')}
              className={`text-[20px] font-bold leading-[30px] transition-colors ${
                activeTab === 'installed' ? 'text-[#1F2329]' : 'text-[#6F7888]'
              }`}
            >
              {INSTALLED}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('plaza')}
              className={`text-[20px] font-bold leading-[30px] transition-colors ${
                activeTab === 'plaza' ? 'text-[#1F2329]' : 'text-[#6F7888]'
              }`}
            >
              {SKILL_PLAZA}
            </button>
          </div>
          <div
            className="h-0.5 w-[58px] bg-[#1F2329] transition-all"
            style={{
              transform: activeTab === 'plaza' ? 'translateX(110px)' : 'translateX(0)',
            }}
          />
        </div>
        <button
          type="button"
          className="rounded-2xl border border-[#DADFE5] bg-white px-[18px] py-2 text-[13px] font-semibold text-[#5F6775] transition-colors hover:bg-[#F7F8FA]"
        >
          {IMPORT_SKILL}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="rounded-xl border border-[#ECEFF3] bg-white p-4">
          {activeTab === 'plaza' ? <HubSkillsTab /> : <HubCapabilityTab />}
        </div>
      </div>
    </div>
  );
}
