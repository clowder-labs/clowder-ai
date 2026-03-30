'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { apiFetch } from '@/utils/api-client';
import { getIsSkipAuth, getUserId } from '@/utils/userId';
import VersionUpdateModal from './VersionUpdateModal';

interface UserProfileProps {
  className?: string;
}

export function UserProfile({ className }: UserProfileProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [showVersionUpdate, setShowVersionUpdate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSkipAuth, setIsSkipAuth] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const userId = getUserId();
  const { theme, toggleTheme } = useTheme();

  const getUserName = () => {
    if (userId === 'default-user') return '未登录';
    const parts = userId.split(':');
    return parts.length > 1 ? parts[1] || parts[0] : parts[0];
  };

  const userName = getUserName();
  const avatarLetter = userName.charAt(0).toUpperCase();

  const handleTogglePanel = () => {
    setShowPanel(!showPanel);
  };

  const handleOpenVersionUpdate = () => {
    setShowVersionUpdate(true);
    setShowPanel(false);
  };

  const handleCloseVersionUpdate = () => {
    setShowVersionUpdate(false);
  };

  const handleToggleTheme = () => {
    toggleTheme();
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
      }
    };

    if (showPanel) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPanel]);

  useEffect(() => {
    setIsSkipAuth(getIsSkipAuth());
  }, []);

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      <button
        type="button"
        onClick={handleTogglePanel}
        className="group flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <div className="h-9 w-9 flex-shrink-0 rounded-full bg-cocreator-primary flex items-center justify-center">
          <span className="text-sm font-bold text-white">{avatarLetter}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-900" title={userName}>
            {userName}
          </div>
        </div>

        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${showPanel ? 'rotate-90' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {showPanel && (
        <div className="absolute bottom-full left-3 right-3 z-50 mb-2 h-[320px] rounded-3xl border border-gray-200 bg-white shadow-lg">
          <div className="h-full overflow-y-auto p-5">
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cocreator-primary">
                  <span className="text-base font-bold text-white">{avatarLetter}</span>
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">{userName}</div>
                  <div className="text-xs text-gray-500">已登录</div>
                </div>
              </div>
            </div>

            <div className="mb-4 border-t border-gray-200"></div>

            <div className="space-y-4">
              <button
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                onClick={handleOpenVersionUpdate}
              >
                <svg className="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                版本更新
              </button>

              <button
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                onClick={handleToggleTheme}
              >
                <svg className="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M8 8h8M8 12h8M8 16h8" />
                </svg>
                主题模式
              </button>

              <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50">
                <svg className="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                帮助
              </button>
            </div>

            {!isSkipAuth && (
              <>
                <div className="mt-4 border-t border-gray-200"></div>
                <button
                  onClick={handleLogout}
                  disabled={isLoading}
                  className="mt-4 h-7 w-full rounded-full border border-gray-300 bg-white text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? '退出中...' : '退出登录'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <VersionUpdateModal open={showVersionUpdate} onCancel={handleCloseVersionUpdate} />
    </div>
  );
}
