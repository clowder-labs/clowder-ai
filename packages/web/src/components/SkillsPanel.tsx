'use client';

import { HubSkillsTab } from './HubSkillsTab';

const INSTALLED = '\u5df2\u5b89\u88c5';
const SKILL_PLAZA = '\u6280\u80fd\u5e7f\u573a';
const IMPORT_SKILL = '\u5bfc\u5165';

export function SkillsPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 bg-[#FFFFFF]">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-5">
            <h1 className="text-[24px] font-bold text-[#1F2329]">{INSTALLED}</h1>
            <span className="text-[22px] font-semibold text-[#6F7888]">{SKILL_PLAZA}</span>
          </div>
          <div className="h-0.5 w-[58px] bg-[#1F2329]" />
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
          <HubSkillsTab />
        </div>
      </div>
    </div>
  );
}
