'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTheme, type ThemeType } from '@/hooks/useTheme';
import { apiFetch } from '@/utils/api-client';
import { getIsSkipAuth, getUserId } from '@/utils/userId';
import SecurityManagementModal from './SecurityManagementModal';
import { UsageStatsModal } from './UsageStatsModal';
import VersionUpdateModal from './VersionUpdateModal';

interface UserProfileProps {
  className?: string;
}

const THEME_OPTIONS: Array<{
  id: ThemeType;
  label: string;
  swatchBackground: string;
  selectedBadgeBackground: string;
}> = [
  {
    id: 'business',
    label: '灰白',
    swatchBackground:
      'linear-gradient(-50.71deg, rgba(237, 244, 246, 1), rgba(235, 235, 235, 1) 100%)',
    selectedBadgeBackground: 'rgb(59,130,246)',
  },
  {
    id: 'warm',
    label: '橙白',
    swatchBackground:
      'linear-gradient(144.26deg, rgba(255, 203, 162, 1), rgba(255, 236, 221, 1) 100%)',
    selectedBadgeBackground: 'rgb(204,109,26)',
  },
];

const HELP_URL = 'https://support.huaweicloud.com/officeclaw-agentarts-pc/officeclaw-agentarts-pc-0001.html';

export function UserProfile({ className }: UserProfileProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [showUsageStats, setShowUsageStats] = useState(false);
  const [showVersionUpdate, setShowVersionUpdate] = useState(false);
  const [showSecurityManagement, setShowSecurityManagement] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSkipAuth, setIsSkipAuth] = useState(false);
  const [themePopoverTop, setThemePopoverTop] = useState(0);
  const [themePopoverLeft, setThemePopoverLeft] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const profilePanelRef = useRef<HTMLDivElement>(null);
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const themeAnchorRef = useRef<HTMLDivElement>(null);
  const themePopoverRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const userId = getUserId();
  const { theme, setTheme } = useTheme();

  const getUserName = () => {
    if (userId === 'default-user') return '未登录';
    const parts = userId.split(':');
    return parts.length > 1 ? parts[1] || parts[0] : parts[0];
  };

  const userName = getUserName();
  const avatarLetter = userName.charAt(0).toUpperCase();
  const profileActionClass =
    'ui-overlay-item flex w-full items-center gap-2 px-3 py-2 text-[14px] font-normal leading-[20px]';

  const updateThemePopoverPosition = () => {
    if (!panelRef.current || !profilePanelRef.current || !themeAnchorRef.current) return;

    const rootRect = panelRef.current.getBoundingClientRect();
    const profilePanelRect = profilePanelRef.current.getBoundingClientRect();
    const anchorRect = themeAnchorRef.current.getBoundingClientRect();
    setThemePopoverTop(anchorRect.top - rootRect.top);
    setThemePopoverLeft(profilePanelRect.right - rootRect.left);
  };

  const handleTogglePanel = () => {
    setShowPanel((prev) => {
      const next = !prev;
      if (!next) setShowThemePanel(false);
      return next;
    });
  };

  const handleOpenUsageStats = () => {
    setShowUsageStats(true);
    setShowThemePanel(false);
    setShowPanel(false);
  };

  const handleCloseUsageStats = () => {
    setShowUsageStats(false);
  };

  const handleOpenVersionUpdate = () => {
    setShowVersionUpdate(true);
    setShowThemePanel(false);
    setShowPanel(false);
  };

  const handleOpenSecurityManagement = () => {
    setShowSecurityManagement(true);
    setShowThemePanel(false);
    setShowPanel(false);
  };

  const handleCloseSecurityManagement = () => {
    setShowSecurityManagement(false);
  };

  const handleCloseVersionUpdate = () => {
    setShowVersionUpdate(false);
  };

  const openThemePanel = () => {
    updateThemePopoverPosition();
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
    setShowPanel(false);
  };

  const handleOpenHelp = () => {
    window.open(HELP_URL, '_blank', 'noopener,noreferrer');
    setShowThemePanel(false);
    setShowPanel(false);
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
        localStorage.removeItem('cat-cafe-userId');
        router.replace('/login');
      } else {
        console.error('退出登录失败');
      }
    } catch (err) {
      console.error('退出登录错误:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setShowPanel(false);
        setShowThemePanel(false);
      }
    };

    if (showPanel || showThemePanel) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPanel, showThemePanel]);

  useEffect(() => {
    if (!showPanel || !showThemePanel) return;

    updateThemePopoverPosition();

    const handlePositionChange = () => {
      updateThemePopoverPosition();
    };

    const scrollElement = panelScrollRef.current;
    window.addEventListener('resize', handlePositionChange);
    scrollElement?.addEventListener('scroll', handlePositionChange, { passive: true });

    return () => {
      window.removeEventListener('resize', handlePositionChange);
      scrollElement?.removeEventListener('scroll', handlePositionChange);
    };
  }, [showPanel, showThemePanel]);

  useEffect(() => {
    setIsSkipAuth(getIsSkipAuth());
  }, []);

  return (
    <div className={`border-none relative ${className ?? ''}`} ref={panelRef}>
      <button
        type="button"
        onClick={handleTogglePanel}
        className="group border-none flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-gray-50"
        data-testid="user-profile-toggle"
      >
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#e3e3e3]">
          <span className="text-sm font-bold text-[#191919]">{avatarLetter}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-medium text-gray-900" title={userName}>
            {userName}
          </div>
        </div>

        <svg
          className="h-4 w-4 shrink-0 text-[#191919] transition-transform"
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
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e3e3e3]">
                  <span className="text-base font-bold text-[#191919]">{avatarLetter}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-normal text-gray-900" title={userName}>
                    {userName}
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-3 border-t border-gray-200" />

            <div className="space-y-3" data-testid="user-profile-content-actions">
              <button
                 className={profileActionClass}
                onClick={handleOpenUsageStats}
              >
                <img src="/icons/userprofile/usage.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
                用量统计
              </button>

              {/* <button
                className={profileActionClass}
                onClick={handleOpenSecurityManagement}
              >
                <img src="/icons/userprofile/version.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
                安全管理
              </button> */}

              <button
                className={profileActionClass}
                onClick={handleOpenVersionUpdate}
              >
                <img src="/icons/userprofile/version.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
                版本更新
              </button>

              <div
                className="relative"
                data-testid="user-profile-theme-anchor"
                ref={themeAnchorRef}
              >
                <button
                  className={profileActionClass}
                  onClick={handleToggleThemePanel}
                  data-testid="user-profile-theme-trigger"
                >
                  <img src="/icons/userprofile/theme.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-left">主题模式</span>
                  <svg
                    data-testid="user-profile-theme-arrow"
                    className="h-4 w-4 shrink-0 text-[var(--overlay-item-text)]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <button className={profileActionClass} onClick={handleOpenHelp}>
                <img src="/icons/userprofile/help.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
                帮助
              </button>
            </div>

            {!isSkipAuth && (
              <>
                <div className="mt-3 border-t border-gray-200" />
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
          className="ui-overlay-card absolute z-[60] rounded-[var(--radius-md)] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.08)]"
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
                    className={`ui-overlay-item flex flex-col items-center gap-2 text-center hover:border-transparent hover:bg-transparent hover:text-[var(--overlay-item-text)] focus-visible:border-transparent focus-visible:bg-transparent focus-visible:text-[var(--overlay-item-text)]`}
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
                          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-white"
                          data-testid={`user-theme-selected-badge-${option.id}`}
                          style={{ backgroundColor: option.selectedBadgeBackground }}
                        >
                          <svg className="h-[12px] w-[12px]" viewBox="0 0 16 16" fill="#191919" aria-hidden="true">
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
                    <span className="whitespace-nowrap text-[12px] font-medium leading-[18px] text-[#2E3440]">
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showUsageStats ? <UsageStatsModal open={showUsageStats} onClose={handleCloseUsageStats} /> : null}
      <SecurityManagementModal open={showSecurityManagement} onClose={handleCloseSecurityManagement} />
      <VersionUpdateModal open={showVersionUpdate} onCancel={handleCloseVersionUpdate} />
    </div>
  );
}
