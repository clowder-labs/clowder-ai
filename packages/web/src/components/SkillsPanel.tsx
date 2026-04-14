/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useState } from 'react';
import { useToastStore } from '@/stores/toastStore';
import { AppModal } from './AppModal';
import { HubCapabilityTab, type SelectedSkillSummary } from './HubCapabilityTab';
import { HubSkillsTab } from './HubSkillsTab';
import { SkillDetailView } from './SkillDetailView';
import { UploadSkillModal } from './UploadSkillModal';

const INSTALLED = '我的技能';
const SKILL_PLAZA = '技能广场';
const UPLOAD_SUCCESS_LABEL = '技能上传成功';
const SKILL_PLAZA_RISK_ACK_KEY = 'cat-cafe:skills-plaza-risk-ack:v1';
const RISK_TITLE = '风险提示';
const RISK_MESSAGE =
  '请注意，部分技能来源于第三方，当您使用第三方外部技能时，您承诺将严格遵守第三方的相关条款（包括但不限于license协议）。华为云不对第三方产品的合规性和安全性保证，请您使用前慎重考虑并评估风险。';

function hasSkillPlazaRiskAgreed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SKILL_PLAZA_RISK_ACK_KEY) === '1';
  } catch {
    return false;
  }
}

function markSkillPlazaRiskAgreed(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SKILL_PLAZA_RISK_ACK_KEY, '1');
  } catch {
    // ignore storage failure
  }
}

export function SkillsPanel() {
  const addToast = useToastStore((s) => s.addToast);
  const [activeTab, setActiveTab] = useState<'installed' | 'plaza'>('installed');
  const [showUpload, setShowUpload] = useState(false);
  const [capabilityRefreshSignal, setCapabilityRefreshSignal] = useState(0);
  const [selectedSkill, setSelectedSkill] = useState<SelectedSkillSummary | null>(null);
  const [showSkillPlazaRiskModal, setShowSkillPlazaRiskModal] = useState(false);

  const handleOpenSkillPlaza = () => {
    setSelectedSkill(null);
    if (hasSkillPlazaRiskAgreed()) {
      setActiveTab('plaza');
      return;
    }
    setShowSkillPlazaRiskModal(true);
  };

  const handleAgreeSkillPlazaRisk = () => {
    markSkillPlazaRiskAgreed();
    setShowSkillPlazaRiskModal(false);
    setActiveTab('plaza');
  };

  if (selectedSkill) {
    return (
      <div className="ui-page-shell gap-2">
        <SkillDetailView
          skillName={selectedSkill.skillName}
          avatarUrl={selectedSkill.avatarUrl}
          onBack={() => setSelectedSkill(null)}
        />
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
          setSelectedSkill(null);
          setCapabilityRefreshSignal((value) => value + 1);
          addToast({
            type: 'success',
            title: '上传成功',
            message: UPLOAD_SUCCESS_LABEL,
            duration: 4000,
          });
        }}
      />
      <AppModal
        open={showSkillPlazaRiskModal}
        onClose={() => setShowSkillPlazaRiskModal(false)}
        title={RISK_TITLE}
        panelClassName="w-[550px]"
        disableBackdropClose
        showCloseButton={true}
      >
        <div className="space-y-4 pt-[18px]">
          <p className="text-[12px] leading-[18px] text-[var(--text-secondary)]">{RISK_MESSAGE}</p>
          <div className="flex items-center justify-end gap-2">
            <button type="button" className="ui-button-default text-sm px-[24px] py-[6px]" onClick={() => setShowSkillPlazaRiskModal(false)}>
              取消
            </button>
            <button type="button" className="ui-button-primary text-sm px-[24px] py-[6px]" onClick={handleAgreeSkillPlazaRisk}>
              我已同意
            </button>
          </div>
        </div>
      </AppModal>

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
                handleOpenSkillPlaza();
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

      <div className="flex-1">
        {activeTab === 'plaza' ? (
          <HubSkillsTab />
        ) : (
          <HubCapabilityTab
            onImport={() => setShowUpload(true)}
            onSelectSkill={setSelectedSkill}
            refreshSignal={capabilityRefreshSignal}
          />
        )}
      </div>
    </div>
  );
}
