/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { useEffect, useState } from 'react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { apiFetch } from '@/utils/api-client';

export interface VersionUpdateModalProps {
  open: boolean;
  onCancel: () => void;
}

interface VersionInfo {
  curversion: string;
  lastversion: string;
  description: string;
  downloadUrl?: string;
  download_url?: string;
}

const newVersionTitleStyle = {
  background:
    'linear-gradient(224.38deg, rgba(234, 56, 18, 1), rgba(255, 100, 84, 0.44) 50%, rgba(255, 119, 49, 0.35) 72%, rgba(255, 92, 12, 1) 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  textFillColor: 'transparent',
  fontFamily: '.PingFang SC',
  fontSize: '20px',
  fontWeight: 700,
  lineHeight: '30px',
} as React.CSSProperties & { textFillColor: string };

const VersionUpdateModal: React.FC<VersionUpdateModalProps> = ({ open, onCancel }) => {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const normalizeVersion = (version: string): number[] =>
    version
      .trim()
      .replace(/^[^\d]*/, '')
      .split(/[.\-+_]/)
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));

  const compareVersions = (a: string, b: string): number => {
    const aParts = normalizeVersion(a);
    const bParts = normalizeVersion(b);
    const maxLen = Math.max(aParts.length, bParts.length);

    for (let i = 0; i < maxLen; i += 1) {
      const aVal = aParts[i] ?? 0;
      const bVal = bParts[i] ?? 0;
      if (aVal > bVal) return 1;
      if (aVal < bVal) return -1;
    }

    return 0;
  };

  const checkVersion = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/lastversion');
      const data = (await res.json()) as VersionInfo;
      setVersionInfo(data);
    } catch (error) {
      console.error('获取版本信息失败:', error);
      setVersionInfo(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      checkVersion();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setVersionInfo(null);
    }
  }, [open]);

  useEscapeKey({
    enabled: open,
    onEscape: onCancel,
  });

  const currentVersion = versionInfo?.curversion ?? '';
  const hasNewVersion =
    !!versionInfo?.lastversion &&
    !!versionInfo?.curversion &&
    compareVersions(versionInfo.lastversion, versionInfo.curversion) > 0;
  const iconAlignmentClassName = hasNewVersion ? 'justify-start' : 'justify-center';
  const contentAlignmentClassName = hasNewVersion ? 'text-left' : 'text-center';

  const handleDownload = () => {
    const downloadUrl = versionInfo?.downloadUrl || versionInfo?.download_url || '';
    if (!downloadUrl) return;
    window.open(downloadUrl, '_blank');
  };

  const handleCancel = () => {
    onCancel();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div
        className="relative w-[360px] max-w-[90vw] rounded-[16px] bg-white text-center shadow-lg"
        style={{
          backgroundImage: 'url("/images/version-bg.svg")',
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <button className="absolute right-5 top-5 text-gray-400 hover:text-gray-600" onClick={handleCancel}>
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div data-testid="version-update-content" className={`p-8 ${contentAlignmentClassName}`}>
          <div className={`mb-6 flex ${iconAlignmentClassName}`}>
            <img src="/images/lobster.svg" alt="版本更新" className="h-[64px] w-[64px] object-contain" />
          </div>

          <div className="mb-1">
            {isLoading ? (
              <span className="text-base font-bold">检查版本中...</span>
            ) : hasNewVersion ? (
              <span data-testid="version-update-title" style={newVersionTitleStyle}>
                发现新版本V{versionInfo?.lastversion}
              </span>
            ) : (
              <span className="text-base font-bold">暂无新版本</span>
            )}
          </div>

          <div className="mb-4 text-sm text-gray-500">当前版本V{currentVersion}</div>

          {hasNewVersion && versionInfo && (
            <div className="mb-6 max-h-[150px] overflow-y-auto rounded-lg text-left text-sm">
              <pre className="whitespace-pre-wrap font-sans">{versionInfo.description}</pre>
            </div>
          )}

          {hasNewVersion && !isLoading && (
            <div data-testid="version-update-actions" className="flex justify-start gap-3">
              <button data-testid="version-update-cancel" className="ui-button-default" onClick={handleCancel}>
                下次再说
              </button>
              <button data-testid="version-update-confirm" className="ui-button-primary" onClick={handleDownload}>
                立即更新
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VersionUpdateModal;
