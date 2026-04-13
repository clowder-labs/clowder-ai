/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AuthHeroShowcase } from '@/components/auth/AuthShell';
import { apiFetch } from '@/utils/api-client';
import { setAuthIdentity, setIsSkipAuth } from '@/utils/userId';

type LoginStatusResponse = {
  islogin?: boolean;
  isskip?: boolean;
  pendingInvitation?: boolean;
  loginUrl?: string;
  userId?: string;
  userName?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [loginUrl, setLoginUrl] = useState('');
  const [error, setError] = useState('');
  const [isPreparing, setIsPreparing] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const bootstrapLogin = useCallback(
    async (options?: { redirectWhenReady?: boolean; cancelled?: () => boolean }) => {
      setIsPreparing(true);
      setError('');

      try {
        const response = await apiFetch('/api/islogin');
        const data = (await response.json()) as LoginStatusResponse;
        if (options?.cancelled?.()) return;

        if (typeof data?.userId === 'string' && data.userId.trim()) {
          setAuthIdentity({
            userId: data.userId,
            userName: typeof data?.userName === 'string' ? data.userName : undefined,
          });
        }
        setIsSkipAuth(Boolean(data?.isskip));

        if (data?.islogin) {
          router.replace('/');
          return;
        }

        if (data?.pendingInvitation) {
          router.replace('/login/invitation');
          return;
        }

        const nextLoginUrl = typeof data?.loginUrl === 'string' ? data.loginUrl : '';
        setLoginUrl(nextLoginUrl);

        if (!nextLoginUrl) {
          setError('未获取到认证地址，请联系管理员检查登录配置');
          return;
        }

        if (options?.redirectWhenReady) {
          setIsRedirecting(true);
          window.location.replace(nextLoginUrl);
        }
      } catch (err) {
        console.error('初始化登录流程失败:', err);
        if (!options?.cancelled?.()) {
          setLoginUrl('');
          setError('打开统一认证页失败，请稍后重试');
        }
      } finally {
        if (!options?.cancelled?.()) {
          setIsPreparing(false);
        }
      }
    },
    [router],
  );

  useEffect(() => {
    let cancelled = false;
    void bootstrapLogin({ cancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, [bootstrapLogin]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(250,222,197,0.28),_transparent_38%),linear-gradient(135deg,_#FFF8F2_0%,_#FFFFFF_56%,_#FFF4EA_100%)] px-4 py-8 sm:px-6 md:px-8 lg:px-12 lg:py-10 xl:px-16">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[1280px] items-center justify-center lg:min-h-[calc(100vh-5rem)]">
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
          <AuthHeroShowcase />

          <div className="mt-12 flex w-full max-w-[360px] flex-col items-center gap-4 text-center">
            {error ? <p className="text-sm leading-6 text-[#D92D20]">{error}</p> : null}

            <button
              type="button"
              disabled={isPreparing || isRedirecting}
              onClick={() => {
                if (loginUrl) {
                  setIsRedirecting(true);
                  window.location.replace(loginUrl);
                  return;
                }

                void bootstrapLogin({ redirectWhenReady: true });
              }}
              className="mx-auto flex h-8 w-[250px] items-center justify-center rounded-full bg-[#191919] px-6 text-[12px] font-normal text-white shadow-[0_18px_38px_-22px_rgba(17,24,39,0.95)] transition hover:-translate-y-0.5 hover:bg-[#242424] disabled:cursor-not-allowed disabled:bg-[#D1D5DB] disabled:shadow-none"
            >
              立即登录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
