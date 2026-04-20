'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type ThemeType, useTheme } from '@/hooks/useTheme';
import { apiFetch } from '@/utils/api-client';
import { clearAuthIdentity, getIsSkipAuth, getUserId, getUserName } from '@/utils/userId';
import { AgentManagementIcon } from './AgentManagementIcon';
import SecurityManagementModal from './SecurityManagementModal';
import { OverflowTooltip } from './shared/OverflowTooltip';
import { UsageStatsModal } from './UsageStatsModal';
import VersionUpdateModal from './VersionUpdateModal';

interface VersionInfo {
  curversion: string;
  lastversion: string;
  description: string;
  downloadUrl?: string;
  download_url?: string;
}

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

interface UserProfileProps {
  className?: string;
}

const THEME_OPTIONS: Array<{
  id: ThemeType;
  label: string;
  swatchBackground: string;
  selectedBadgeBackground: string;
  selectedBadgeColor: string;
}> = [
  {
    id: 'business',
    label: '灰白',
    swatchBackground: 'var(--theme-preview-business-bg)',
    selectedBadgeBackground: 'var(--theme-preview-business-badge)',
    selectedBadgeColor: 'var(--theme-preview-business-check)',
  },
  {
    id: 'warm',
    label: '橙白',
    swatchBackground: 'var(--theme-preview-warm-bg)',
    selectedBadgeBackground: 'var(--theme-preview-warm-badge)',
    selectedBadgeColor: 'var(--theme-preview-warm-check)',
  },
  // {
  //   id: 'dark',
  //   label: '暗黑',
  //   swatchBackground: 'var(--theme-preview-dark-bg)',
  //   selectedBadgeBackground: 'var(--theme-preview-dark-badge)',
  //   selectedBadgeColor: 'var(--theme-preview-dark-check)',
  // },
];

const HELP_URL = 'https://support.huaweicloud.com/officeclaw-agentarts-pc/officeclaw-agentarts-pc-0001.html';
const PRIVACY_DECLARATION_URL = 'https://www.huaweicloud.com/declaration/sa_prp.html';
const DEFAULT_LOGOUT_URL =
  process.env.NEXT_PUBLIC_CAS_LOGOUT_URL ||
  'https://auth.huaweicloud.com/authui/login.html?service=https://auth.huaweicloud.com/authui/v1/oauth2/authorize?';

export function UserProfile({ className }: UserProfileProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [showAboutPanel, setShowAboutPanel] = useState(false);
  const [showUsageStats, setShowUsageStats] = useState(false);
  const [showVersionUpdate, setShowVersionUpdate] = useState(false);
  const [showSecurityManagement, setShowSecurityManagement] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSkipAuth, setIsSkipAuth] = useState(false);
  const [themePopoverTop, setThemePopoverTop] = useState(0);
  const [themePopoverLeft, setThemePopoverLeft] = useState(0);
  const [aboutPopoverTop, setAboutPopoverTop] = useState(0);
  const [aboutPopoverLeft, setAboutPopoverLeft] = useState(0);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const profilePanelRef = useRef<HTMLDivElement>(null);
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const themeAnchorRef = useRef<HTMLDivElement>(null);
  const aboutAnchorRef = useRef<HTMLDivElement>(null);
  const themePopoverRef = useRef<HTMLDivElement>(null);
  const aboutPopoverRef = useRef<HTMLDivElement>(null);
  const userId = getUserId();
  const storedUserName = getUserName();
  const { theme, setTheme } = useTheme();

  const hasNewVersion =
    !!versionInfo?.lastversion &&
    !!versionInfo?.curversion &&
    compareVersions(versionInfo.lastversion, versionInfo.curversion) > 0;

  const checkVersion = useCallback(async () => {
    if (typeof window === 'undefined') return;

    try {
      const res = await apiFetch('/api/lastversion');
      if (!res.ok) return;

      const data = (await res.json()) as VersionInfo;
      if (!data?.curversion) return;

      setVersionInfo(data);

      const isNewVersionAvailable =
        !!data.lastversion && !!data.curversion && compareVersions(data.lastversion, data.curversion) > 0;

      if (isNewVersionAvailable) {
        setShowVersionUpdate(true);
      } else {
        const taskId = `version-${data.curversion}`;
        try {
          await apiFetch('/api/download/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId }),
          });
        } catch {}
      }
    } catch {}
  }, []);

  const handleCloseVersionUpdate = useCallback(() => {
    setShowVersionUpdate(false);
  }, []);

  const userName = storedUserName || (userId === 'default-user' ? '未登录' : userId);
  const avatarLetter = userName.charAt(0).toUpperCase();
  const profileActionClass =
    'ui-overlay-item flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-[14px] font-normal leading-[22px] text-[var(--overlay-text)]';
  const profileSubActionClass =
    'ui-overlay-item flex w-full items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-left text-[14px] font-normal leading-[22px] text-[var(--overlay-text)]';

  const calculatePopoverPosition = (anchorElement: HTMLDivElement | null) => {
    if (!panelRef.current || !profilePanelRef.current || !anchorElement) return null;

    const rootRect = panelRef.current.getBoundingClientRect();
    const profilePanelRect = profilePanelRef.current.getBoundingClientRect();
    const anchorRect = anchorElement.getBoundingClientRect();

    return {
      top: anchorRect.top - rootRect.top,
      left: profilePanelRect.right - rootRect.left,
    };
  };

  const updateThemePopoverPosition = () => {
    const position = calculatePopoverPosition(themeAnchorRef.current);
    if (!position) return;
    setThemePopoverTop(position.top);
    setThemePopoverLeft(position.left);
  };

  const updateAboutPopoverPosition = () => {
    const position = calculatePopoverPosition(aboutAnchorRef.current);
    if (!position) return;
    setAboutPopoverTop(position.top);
    setAboutPopoverLeft(position.left);
  };

  const handleTogglePanel = () => {
    setShowPanel((prev) => {
      const next = !prev;
      if (!next) {
        setShowThemePanel(false);
        setShowAboutPanel(false);
      }
      return next;
    });
  };

  const handleOpenUsageStats = () => {
    setShowUsageStats(true);
    setShowThemePanel(false);
    setShowAboutPanel(false);
    setShowPanel(false);
  };

  const handleCloseUsageStats = () => {
    setShowUsageStats(false);
  };

  const handleOpenVersionUpdate = async () => {
    if (!hasNewVersion) {
      await checkVersion();
    }
    setShowVersionUpdate(true);
    setShowThemePanel(false);
    setShowAboutPanel(false);
    setShowPanel(false);
  };

  const handleOpenSecurityManagement = () => {
    setShowSecurityManagement(true);
    setShowThemePanel(false);
    setShowAboutPanel(false);
    setShowPanel(false);
  };

  const handleCloseSecurityManagement = () => {
    setShowSecurityManagement(false);
  };

  const openThemePanel = () => {
    updateThemePopoverPosition();
    setShowAboutPanel(false);
    setShowThemePanel(true);
  };

  const handleToggleThemePanel = () => {
    if (showThemePanel) {
      setShowThemePanel(false);
      return;
    }
    openThemePanel();
  };

  const handleSelectTheme = (nextTheme: ThemeType) => {
    setTheme(nextTheme);
    setShowThemePanel(false);
    setShowAboutPanel(false);
    setShowPanel(false);
  };

  const handleOpenHelp = () => {
    window.open(HELP_URL, '_blank', 'noopener,noreferrer');
    setShowThemePanel(false);
    setShowAboutPanel(false);
    setShowPanel(false);
  };

  const openAboutPanel = () => {
    updateAboutPopoverPosition();
    setShowThemePanel(false);
    setShowAboutPanel(true);
  };

  const handleToggleAboutPanel = () => {
    if (showAboutPanel) {
      setShowAboutPanel(false);
      return;
    }
    openAboutPanel();
  };

  const handleOpenPrivacyDeclaration = () => {
    window.open(PRIVACY_DECLARATION_URL, '_blank', 'noopener,noreferrer');
    setShowThemePanel(false);
    setShowAboutPanel(false);
    setShowPanel(false);
  };

  const finishLogout = (logoutUrl?: string) => {
    clearAuthIdentity();
    setShowThemePanel(false);
    setShowAboutPanel(false);
    setShowPanel(false);
    window.location.assign(logoutUrl || DEFAULT_LOGOUT_URL);
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch('/api/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        const data = await response.json();
        finishLogout(typeof data?.logoutUrl === 'string' ? data.logoutUrl : undefined);
        return;
      }

      console.error('退出登录失败');
    } catch (err) {
      console.error('退出登录错误:', err);
      finishLogout();
      return;
    } finally {
      setIsLoading(false);
    }

    finishLogout();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setShowPanel(false);
        setShowThemePanel(false);
        setShowAboutPanel(false);
      }
    };

    if (showPanel || showThemePanel || showAboutPanel) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPanel, showThemePanel, showAboutPanel]);

  useEffect(() => {
    if (!showPanel || (!showThemePanel && !showAboutPanel)) return;

    if (showThemePanel) {
      updateThemePopoverPosition();
    }
    if (showAboutPanel) {
      updateAboutPopoverPosition();
    }

    const handlePositionChange = () => {
      if (showThemePanel) {
        updateThemePopoverPosition();
      }
      if (showAboutPanel) {
        updateAboutPopoverPosition();
      }
    };

    const scrollElement = panelScrollRef.current;
    window.addEventListener('resize', handlePositionChange);
    scrollElement?.addEventListener('scroll', handlePositionChange, { passive: true });

    return () => {
      window.removeEventListener('resize', handlePositionChange);
      scrollElement?.removeEventListener('scroll', handlePositionChange);
    };
  }, [showPanel, showThemePanel, showAboutPanel]);

  useEffect(() => {
    setIsSkipAuth(getIsSkipAuth());
  }, []);

  useEffect(() => {
    checkVersion();
  }, [checkVersion]);

  return (
    <div className={`border-none relative ${className ?? ''}`} ref={panelRef}>
      <button
        type="button"
        onClick={handleTogglePanel}
        className="group border-none flex w-full items-center gap-3 px-3 py-3 text-left text-[var(--text-primary)] transition-colors hover:bg-[var(--overlay-item-hover-bg)]"
        data-testid="user-profile-toggle"
      >
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-avatar-shell)]">
          <span className="text-sm font-bold text-[var(--text-primary)]">{avatarLetter}</span>
        </div>

        <OverflowTooltip content={userName} className="min-w-0 flex-1">
          <div data-testid="user-profile-name" className="truncate text-[16px] font-medium text-[var(--text-primary)]">
            {userName}
          </div>
        </OverflowTooltip>

        <svg
          className="h-4 w-4 shrink-0 text-[var(--text-primary)] transition-transform"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {showPanel && (
        <div
          className="ui-overlay-card absolute bottom-full left-3 right-3 z-50 -mb-[4px] rounded-[var(--radius-lg)]"
          data-testid="user-profile-panel"
          ref={profilePanelRef}
        >
          <div className="p-4 border-none" data-testid="user-profile-panel-scroll" ref={panelScrollRef}>
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-avatar-shell)]">
                  <span className="text-base font-bold text-[var(--text-primary)]">{avatarLetter}</span>
                </div>
                <OverflowTooltip content={userName} className="min-w-0 flex-1">
                  <div
                    data-testid="user-profile-panel-name"
                    className="truncate text-[16px] font-normal text-[var(--text-primary)]"
                  >
                    {userName}
                  </div>
                </OverflowTooltip>
              </div>
            </div>

            <div className="mb-3 border-t border-[var(--panel-divider)]" />

            <div className="space-y-3" data-testid="user-profile-content-actions">
              <button className={profileActionClass} onClick={handleOpenSecurityManagement}>
                <img src="/icons/userprofile/security.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
                安全管理
              </button>

              <button className={profileActionClass} onClick={handleOpenUsageStats}>
                <img src="/icons/userprofile/usage.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
                用量统计
              </button>

              <button className={profileActionClass} onClick={handleOpenVersionUpdate}>
                <img src="/icons/userprofile/version.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
                版本更新
              </button>

              <div className="relative" data-testid="user-profile-theme-anchor" ref={themeAnchorRef}>
                <button
                  className={profileActionClass}
                  onClick={handleToggleThemePanel}
                  data-testid="user-profile-theme-trigger"
                >
                  <img src="/icons/userprofile/theme.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-left">主题模式</span>
                  <svg
                    data-testid="user-profile-theme-arrow"
                    className="h-4 w-4 shrink-0 text-[var(--overlay-text)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <div className="relative" data-testid="user-profile-about-anchor" ref={aboutAnchorRef}>
                <button
                  type="button"
                  className={profileActionClass}
                  onClick={handleToggleAboutPanel}
                  data-testid="user-profile-about-trigger"
                >
                  <AgentManagementIcon name="information" className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-left">关于我们</span>
                  <svg
                    data-testid="user-profile-about-arrow"
                    className="h-4 w-4 shrink-0 text-[var(--overlay-text)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {!isSkipAuth && (
              <>
                <div className="mt-3 border-t border-[var(--panel-divider)]" />
                <button
                  onClick={handleLogout}
                  disabled={isLoading}
                  className="ui-button-default mt-4 h-7 w-full text-[12px]"
                >
                  {isLoading ? '退出中...' : '退出登录'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showPanel && showThemePanel && (
        <div
          ref={themePopoverRef}
          className="ui-overlay-card absolute z-[60] rounded-[var(--radius-md)] shadow-[var(--overlay-shadow)]"
          data-testid="user-theme-popover"
          style={{ top: `${themePopoverTop}px`, left: `${themePopoverLeft}px` }}
        >
          <div className="p-4">
            <div className="flex items-start gap-4" data-testid="user-theme-options">
              {THEME_OPTIONS.map((option) => {
                const isActive = theme === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSelectTheme(option.id)}
                    className={`ui-overlay-item flex flex-col items-center gap-2 text-center text-[var(--overlay-text)] hover:border-transparent hover:bg-transparent hover:text-[var(--overlay-text)] focus-visible:border-transparent focus-visible:bg-transparent focus-visible:text-[var(--overlay-text)]`}
                    data-testid={`user-theme-option-${option.id}`}
                  >
                    <div className="relative">
                      <div
                        className="h-9 w-9 rounded-full"
                        data-testid={`user-theme-swatch-${option.id}`}
                        style={{ background: option.swatchBackground }}
                      />
                      {isActive && (
                        <div
                          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full"
                          data-testid={`user-theme-selected-badge-${option.id}`}
                          style={{
                            backgroundColor: option.selectedBadgeBackground,
                            color: option.selectedBadgeColor,
                          }}
                        >
                          <svg className="h-[12px] w-[12px]" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path
                              d="M4 8.25 6.5 10.75 12 5.25"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <span className="whitespace-nowrap text-[12px] font-medium leading-[18px] text-[var(--overlay-text)]">
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showPanel && showAboutPanel && (
        <div
          ref={aboutPopoverRef}
          className="ui-overlay-card absolute z-[60] min-w-[180px] rounded-[var(--radius-md)] shadow-[var(--overlay-shadow)]"
          data-testid="user-about-popover"
          style={{ top: `${aboutPopoverTop}px`, left: `${aboutPopoverLeft}px` }}
        >
          <div className="p-[16px]">
            <div className="flex flex-col" data-testid="user-about-options">
              <button
                type="button"
                className={profileSubActionClass}
                data-testid="user-about-privacy-action"
                onClick={handleOpenPrivacyDeclaration}
              >
                <span className="flex-1 text-left">隐私声明</span>
                <AgentManagementIcon name="link" className="h-4 w-4 shrink-0" />
              </button>
              <button
                type="button"
                className={profileSubActionClass}
                data-testid="user-about-help-action"
                onClick={handleOpenHelp}
              >
                <span className="flex-1 text-left">帮助文档</span>
                <AgentManagementIcon name="link" className="h-4 w-4 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      )}

      {showUsageStats ? <UsageStatsModal open={showUsageStats} onClose={handleCloseUsageStats} /> : null}
      <SecurityManagementModal open={showSecurityManagement} onClose={handleCloseSecurityManagement} />
      <VersionUpdateModal open={showVersionUpdate} onCancel={handleCloseVersionUpdate} versionInfo={versionInfo} />
    </div>
  );
}
