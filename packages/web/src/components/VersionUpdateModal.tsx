import React, { useEffect, useRef, useState } from 'react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { type DownloadProgress, useDownloadStore } from '@/stores/downloadStore';
import { apiFetch } from '@/utils/api-client';

export interface VersionUpdateModalProps {
  open: boolean;
  onCancel: () => void;
  versionInfo?: VersionInfo | null;
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

function normalizeVersion(version: string): number[] {
  return version
    .trim()
    .replace(/^[^\d]*/, '')
    .split(/[.\-+_]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(a: string, b: string): number {
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
}

const VersionUpdateModal: React.FC<VersionUpdateModalProps> = ({
  open,
  onCancel,
  versionInfo: externalVersionInfo,
}) => {
  const [internalVersionInfo, setInternalVersionInfo] = useState<VersionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const downloadState = useDownloadStore();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const resetRef = useRef(downloadState.reset);
  const updateProgressRef = useRef(downloadState.updateProgress);

  resetRef.current = downloadState.reset;
  updateProgressRef.current = downloadState.updateProgress;

  const versionInfo = externalVersionInfo ?? internalVersionInfo;

  useEffect(() => {
    if (!open) return;

    const checkDownloadStatus = async (taskId: string) => {
      try {
        const res = await apiFetch(`/api/download/status?taskId=${taskId}`);
        if (res.ok) {
          const progress = (await res.json()) as DownloadProgress;
          downloadState.setTaskId(taskId);
          updateProgressRef.current(progress);
        }
      } catch (error) {
        console.error('查询下载状态失败:', error);
      }
    };

    if (externalVersionInfo) {
      const taskId = `version-${externalVersionInfo.lastversion}`;
      checkDownloadStatus(taskId);
    } else {
      setIsLoading(true);
      apiFetch('/api/lastversion')
        .then((res) => res.json())
        .then((data: VersionInfo) => {
          setInternalVersionInfo(data);
          const hasNewVersion =
            !!data.lastversion && !!data.curversion && compareVersions(data.lastversion, data.curversion) > 0;
          if (hasNewVersion) {
            const taskId = `version-${data.lastversion}`;
            checkDownloadStatus(taskId);
          }
        })
        .catch((error) => {
          console.error('获取版本信息失败:', error);
          setInternalVersionInfo(null);
        })
        .finally(() => setIsLoading(false));
    }
  }, [open, externalVersionInfo]);

  useEffect(() => {
    if (!open) {
      setInternalVersionInfo(null);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      resetRef.current();
    }
  }, [open]);

  useEffect(() => {
    if (downloadState.progress.status !== 'downloading' || !downloadState.taskId) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    if (pollIntervalRef.current) return;

    const pollDownloadProgress = async () => {
      try {
        const res = await apiFetch(`/api/download/status?taskId=${downloadState.taskId}`);
        if (res.ok) {
          const progress = (await res.json()) as DownloadProgress;
          updateProgressRef.current(progress);

          if (progress.status === 'success' || progress.status === 'error' || progress.status === 'cancelled') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
        }
      } catch (error) {
        console.error('查询下载进度失败:', error);
      }
    };

    pollIntervalRef.current = setInterval(pollDownloadProgress, 1000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [downloadState.progress.status, downloadState.taskId]);

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

  const handleDownload = async () => {
    const downloadUrl = versionInfo?.downloadUrl || versionInfo?.download_url || '';
    if (!downloadUrl) return;

    const fileName = `OfficeClaw-V${versionInfo?.lastversion || 'latest'}.exe`;
    const taskId = `version-${versionInfo?.lastversion || 'latest'}`;

    downloadState.setTaskId(taskId);
    downloadState.setLoading(true);

    try {
      const res = await apiFetch('/api/download/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, url: downloadUrl, fileName }),
      });

      if (res.ok) {
        const progress = (await res.json()) as DownloadProgress;
        downloadState.updateProgress(progress);
      } else {
        const error = await res.json();
        downloadState.updateProgress({
          status: 'error',
          progress: 0,
          totalBytes: 0,
          receivedBytes: 0,
          fileName,
          filePath: null,
          errorMessage: error.error || '启动下载失败',
          startTime: null,
          endTime: null,
        });
      }
    } catch (error) {
      downloadState.updateProgress({
        status: 'error',
        progress: 0,
        totalBytes: 0,
        receivedBytes: 0,
        fileName,
        filePath: null,
        errorMessage: error instanceof Error ? error.message : '启动下载失败',
        startTime: null,
        endTime: null,
      });
    }
  };

  const handleCancel = () => {
    if (downloadState.progress.status === 'success' || downloadState.progress.status === 'error') {
      downloadState.reset();
    }
    onCancel();
  };

  const openDownloadFile = async () => {
    if (!downloadState.taskId) return;

    downloadState.setInstalling();

    try {
      await apiFetch(`/api/download/open?taskId=${downloadState.taskId}`, { method: 'POST' });
    } catch (error) {
      console.error('打开文件失败:', error);
    }
  };

  if (!open) return null;

  const renderButtonArea = () => {
    if (downloadState.progress.status === 'downloading') {
      return (
        <div className="text-left">
          <button type="button" disabled className="ui-button-primary opacity-50 cursor-not-allowed">
            更新中
          </button>
        </div>
      );
    }

    if (downloadState.progress.status === 'installing') {
      return (
        <div className="text-left">
          <button type="button" disabled className="ui-button-primary opacity-50 cursor-not-allowed">
            安装中
          </button>
        </div>
      );
    }

    if (downloadState.progress.status === 'success') {
      return (
        <div className="text-left">
          <button type="button" className="ui-button-primary" onClick={openDownloadFile}>
            立即安装
          </button>
        </div>
      );
    }

    if (downloadState.progress.status === 'error') {
      return (
        <div className="flex gap-3 justify-start">
          <button type="button" className="ui-button-default" onClick={handleCancel}>
            关闭
          </button>
          <button
            type="button"
            className="ui-button-primary"
            onClick={() => {
              downloadState.reset();
              handleDownload();
            }}
          >
            重试
          </button>
        </div>
      );
    }

    if (hasNewVersion && !isLoading) {
      return (
        <div className="flex gap-3 justify-start">
          <button
            type="button"
            data-testid="version-update-cancel"
            className="ui-button-default"
            onClick={handleCancel}
          >
            下次再说
          </button>
          <button
            type="button"
            data-testid="version-update-confirm"
            className="ui-button-primary"
            onClick={handleDownload}
          >
            立即更新
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop-strong)]">
      <div
        data-testid="version-update-card"
        className="relative w-[360px] max-w-[90vw] rounded-[16px] border border-[var(--modal-border)] bg-[var(--modal-surface)] text-center shadow-[var(--modal-shadow)]"
        style={{
          backgroundImage: 'url("/images/version-bg.svg")',
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <button
          type="button"
          className="absolute right-5 top-5 text-[var(--modal-close-icon)] transition-colors hover:text-[var(--modal-close-icon-hover)]"
          onClick={handleCancel}
          aria-label="关闭"
        >
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-label="关闭"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div data-testid="version-update-content" className={`px-8 pt-8 pb-0 ${contentAlignmentClassName}`}>
          <div className={`mb-6 flex ${iconAlignmentClassName}`}>
            <img src="/images/lobster.svg" alt="版本更新" className="h-[64px] w-[64px] object-contain" />
          </div>

          <div className="mb-1">
            {isLoading ? (
              <span className="text-base font-bold">检查版本中...</span>
            ) : downloadState.progress.status === 'error' ? (
              <span className="text-base font-bold text-red-500">下载失败</span>
            ) : hasNewVersion ? (
              <span data-testid="version-update-title" style={newVersionTitleStyle}>
                发现新版本V{versionInfo?.lastversion}
              </span>
            ) : (
              <span className="text-base font-bold">暂无新版本</span>
            )}
          </div>

          <div className="mb-4 text-sm text-[var(--modal-text-muted)]">当前版本V{currentVersion}</div>
        </div>

        <div className="px-8 pb-0">
          {hasNewVersion && versionInfo && (
            <div className="max-h-[140px] overflow-y-auto rounded-lg text-left text-sm mb-4">
              <pre className="whitespace-pre-wrap font-sans">{versionInfo.description}</pre>
            </div>
          )}

          {downloadState.progress.status === 'downloading' && (
            <div className="text-left mb-4">
              <div className="mb-2 text-[12px]" style={{ color: 'rgb(128, 128, 128)' }}>
                正在下载...
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-full h-[4px]" style={{ backgroundColor: 'rgb(230, 230, 230)' }}>
                  <div
                    className="h-[4px] rounded-full transition-all duration-300"
                    style={{
                      width: `${downloadState.progress.progress}%`,
                      backgroundColor: 'rgb(92, 179, 0)',
                    }}
                  />
                </div>
                <span className="text-sm text-[var(--modal-text-muted)]">{downloadState.progress.progress}%</span>
              </div>
            </div>
          )}

          {downloadState.progress.status === 'success' && (
            <div className="text-left text-sm flex items-center gap-2 mb-4" style={{ color: 'rgb(128, 128, 128)' }}>
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" stroke="rgb(92, 179, 0)" strokeWidth="1.5" fill="none" />
                <path
                  d="M4.5 8.5L6.5 10.5L11.5 5.5"
                  stroke="rgb(92, 179, 0)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              新版本已下载，准备安装
            </div>
          )}

          {downloadState.progress.status === 'installing' && (
            <div className="text-left text-sm mb-4" style={{ color: 'rgb(128, 128, 128)' }}>
              正在安装新版本...
            </div>
          )}

          {downloadState.progress.status === 'error' && (
            <div className="text-left text-sm mb-4 text-[var(--modal-text-muted)]">
              {downloadState.progress.errorMessage}
            </div>
          )}
        </div>

        <div className="px-8 pb-8 pt-4">{renderButtonArea()}</div>
      </div>
    </div>
  );
};

export default VersionUpdateModal;
