'use client';

import { useState } from 'react';
import { useToastStore } from '@/stores/toastStore';
import { HubCapabilityTab } from './HubCapabilityTab';
import { HubSkillsTab } from './HubSkillsTab';
import { SkillDetailView } from './SkillDetailView';
import { UploadSkillModal } from './UploadSkillModal';

const INSTALLED = '我的技能';
const SKILL_PLAZA = '技能广场';
const UPLOAD_SUCCESS_LABEL = '技能上传成功';

export function SkillsPanel() {
  const addToast = useToastStore((s) => s.addToast);
  const [activeTab, setActiveTab] = useState<'installed' | 'plaza'>('installed');
  const [showUpload, setShowUpload] = useState(false);
  const [capabilityRefreshSignal, setCapabilityRefreshSignal] = useState(0);
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(null);

  if (selectedSkillName) {
    return (
      <div className="ui-page-shell gap-2">
        <SkillDetailView skillName={selectedSkillName} onBack={() => setSelectedSkillName(null)} />
      </div>
    );
  }

  return (
    <div className="ui-page-shell gap-2">
      <UploadSkillModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onSuccess={() => {
          setActiveTab('installed');
          setSelectedSkillName(null);
          setCapabilityRefreshSignal((value) => value + 1);
          addToast({
            type: 'success',
            title: '上传成功',
            message: UPLOAD_SUCCESS_LABEL,
            duration: 4000,
          });
        }}
      />

      <div className="ui-page-header-inline items-start border-b">
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
              onClick={() => {
                setActiveTab('plaza');
                setSelectedSkillName(null);
              }}
              className={`ui-tab-trigger ${activeTab === 'plaza' ? 'ui-tab-trigger-active' : ''}`}
            >
              {SKILL_PLAZA}
            </button>
          </div>
          <div
            className="ui-tab-indicator w-[56px]"
            style={{ transform: activeTab === 'plaza' ? 'translateX(78px)' : 'translateX(0)' }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <div className="flex h-full min-h-0 flex-col">
          {activeTab === 'plaza' ? (
            <HubSkillsTab />
          ) : (
            <HubCapabilityTab
              onImport={() => setShowUpload(true)}
              onSelectSkill={setSelectedSkillName}
              refreshSignal={capabilityRefreshSignal}
            />
          )}
        </div>
      </div>
    </div>
  );
}
