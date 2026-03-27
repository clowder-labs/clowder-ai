'use client';

import { HubProviderProfilesTab } from './HubProviderProfilesTab';

const MODEL_TITLE = '\u6a21\u578b';
const ADD_MODEL = '\u6dfb\u52a0\u6a21\u578b';
const MODEL_SETTINGS = '\u53c2\u6570\u7ba1\u7406';

export function ModelsPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 bg-[#FFFFFF]">
      <div className="flex items-center justify-between">
        <h1 className="text-[36px] font-semibold leading-none text-[#1F2329]">{MODEL_TITLE}</h1>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            className="rounded-[18px] bg-[#111418] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#2A3038]"
          >
            {ADD_MODEL}
          </button>
          <p className="text-xs font-medium text-[#7F8796]">{MODEL_SETTINGS}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="rounded-xl border border-[#ECEFF3] bg-white p-4">
          <HubProviderProfilesTab />
        </div>
      </div>
    </div>
  );
}
