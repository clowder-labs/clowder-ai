/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AuthLoadingAnimation, AuthShell } from '@/components/auth/AuthShell';
import { apiFetch } from '@/utils/api-client';
import { setAuthIdentity, setIsSkipAuth } from '@/utils/userId';

type CallbackResponse = {
  success?: boolean;
  needCode?: boolean;
  userId?: string;
  userName?: string;
  message?: string;
  redirectTo?: string;
};

function getTicketFromLocation(): string {
  if (typeof window === 'undefined') return '';
  return new URL(window.location.href).searchParams.get('ticket')?.trim() || '';
}

export default function LoginCallbackPage() {
  const router = useRouter();
  const hasStartedRef = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    let cancelled = false;

    const finalizeLogin = async () => {
      const ticket = getTicketFromLocation();
      if (!ticket) {
        setError('登录回调缺少 ticket 参数，正在返回统一认证页');
        window.setTimeout(() => {
          if (!cancelled) router.replace('/login');
        }, 1800);
        return;
      }

      try {
        const response = await apiFetch('/api/login/callback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ticket }),
        });

        const data = (await response.json()) as CallbackResponse;
        if (cancelled) return;

        setIsSkipAuth(false);

        if (!response.ok || !data?.success || !data.userId) {
          setError(data?.message || '登录回调处理失败，正在返回统一认证页');
          window.setTimeout(() => {
            if (!cancelled) router.replace('/login');
          }, 1800);
          return;
        }

        setAuthIdentity({ userId: data.userId, userName: data.userName });
        router.replace(data.needCode ? '/login/invitation' : data.redirectTo || '/');
      } catch (err) {
        console.error('处理登录回调失败:', err);
        if (!cancelled) {
          setError('登录回调处理失败，正在返回统一认证页');
          window.setTimeout(() => {
            if (!cancelled) router.replace('/login');
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
    <AuthShell
      eyebrow="Callback"
      title="正在完成登录校验"
      description="系统正在校验统一认证票据并初始化你的 OfficeClaw 会话，请稍候。"
    >
      <div className="space-y-6">
        <AuthLoadingAnimation
          label={error ? '认证结果处理中' : '正在校验 ticket 并同步用户状态'}
          detail={error || '首次进入时会顺带完成账户订阅检查，耗时会略长一些。'}
        />

        <div className="rounded-2xl border border-[#F5E3D5] bg-[#FFFDFB] px-4 py-4 text-sm leading-6 text-[#6B7280]">
          登录完成后将自动跳转；如果检测到未注册 OPT，会继续进入邀请码填写步骤。
        </div>
      </div>
    </AuthShell>
  );
}
