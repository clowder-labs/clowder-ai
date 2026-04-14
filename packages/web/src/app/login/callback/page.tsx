/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LoadingPointStyle } from '@/components/LoadingPointStyle';
import { AuthHeroShowcase } from '@/components/auth/AuthShell';
import { apiFetch } from '@/utils/api-client';
import { clearAuthIdentity, setAuthIdentity, setIsSkipAuth } from '@/utils/userId';

type CallbackResponse = {
  success?: boolean;
  needCode?: boolean;
  userId?: string;
  userName?: string;
  message?: string;
  redirectTo?: string;
};

type CallbackRequestResult = {
  ok: boolean;
  data: CallbackResponse;
};

const callbackRequestCache = new Map<string, Promise<CallbackRequestResult>>();

function getTicketFromLocation(): string {
  if (typeof window === 'undefined') return '';
  return new URL(window.location.href).searchParams.get('ticket')?.trim() || '';
}

function replaceLocation(target: string): void {
  if (typeof window !== 'undefined') {
    window.location.replace(target);
  }
}

async function logoutAndRedirect(): Promise<void> {
  try {
    const response = await apiFetch('/api/logout', {
      method: 'POST',
    });
    const data = (await response.json()) as { logoutUrl?: string };
    clearAuthIdentity();
    setIsSkipAuth(false);

    if (response.ok && typeof data?.logoutUrl === 'string' && data.logoutUrl) {
      window.location.replace(data.logoutUrl);
      return;
    }
  } catch (error) {
    console.error('退出登录失败:', error);
  }

  redirectToLogin();
}

function redirectToLogin(): void {
  clearAuthIdentity();
}

function withAuthSuccessRedirect(target: string): string {
  if (!target.startsWith('/')) return target;
  const [pathAndSearch, hash = ''] = target.split('#');
  const [pathname, search = ''] = pathAndSearch.split('?');
  const params = new URLSearchParams(search);
  params.set('authSuccess', '1');
  const nextSearch = params.toString();
  return `${pathname}${nextSearch ? `?${nextSearch}` : ''}${hash ? `#${hash}` : ''}`;
}

async function requestCallbackResult(ticket: string): Promise<CallbackRequestResult> {
  const cachedRequest = callbackRequestCache.get(ticket);
  if (cachedRequest) {
    return cachedRequest;
  }

  const requestPromise = (async () => {
    const response = await apiFetch('/api/login/callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ticket }),
    });

    const data = (await response.json()) as CallbackResponse;
    return {
      ok: response.ok,
      data,
    };
  })().finally(() => {
    callbackRequestCache.delete(ticket);
  });

  callbackRequestCache.set(ticket, requestPromise);
  return requestPromise;
}

export default function LoginCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const finalizeLogin = async () => {
      const ticket = getTicketFromLocation();
      if (!ticket) {
        setError('登录回调缺少 ticket 参数，正在退出登录');
        window.setTimeout(() => {
          if (!cancelled) void logoutAndRedirect();
        }, 1800);
        return;
      }

      try {
        const { ok, data } = await requestCallbackResult(ticket);
        if (cancelled) return;

        setIsSkipAuth(false);

        if (!ok || !data?.success || !data.userId) {
          setError(data?.message || '登录回调处理失败，正在返回统一认证页');
          window.setTimeout(() => {
            if (!cancelled) void logoutAndRedirect();
          }, 1800);
          return;
        }

        setAuthIdentity({ userId: data.userId, userName: data.userName });
        router.replace(data.needCode ? '/login/invitation' : withAuthSuccessRedirect(data.redirectTo || '/'));
      } catch (err) {
        console.error('处理登录回调失败:', err);
        if (!cancelled) {
          setError('登录回调处理失败，正在返回统一认证页');
          window.setTimeout(() => {
            if (!cancelled) void logoutAndRedirect();
          }, 1800);
        }
      }
    };

    void finalizeLogin();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div
      data-testid="login-callback-loading-panel"
      className="min-h-screen w-full bg-[radial-gradient(circle_at_top_left,_rgba(250,222,197,0.28),_transparent_38%),linear-gradient(135deg,_#FFF8F2_0%,_#FFFFFF_56%,_#FFF4EA_100%)] px-4 py-8 sm:px-6 md:px-8 lg:px-12 lg:py-10 xl:px-16"
    >
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1280px] items-center justify-center lg:min-h-[calc(100vh-5rem)]">
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
          <AuthHeroShowcase layout="standalone" />

          <div className="mt-12 flex items-center gap-3 text-[16px] font-normal text-[#595959] sm:text-base">
            <LoadingPointStyle className="h-5 w-5 flex-shrink-0" />
            <span>登录中...</span>
          </div>
        </div>
      </div>
    </div>
  );
}
