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
import { setIsSkipAuth } from '@/utils/userId';

const FALLBACK_LOGIN_MESSAGE = '正在打开华为云统一认证';

export default function LoginPage() {
  const router = useRouter();
  const hasRedirectedRef = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const bootstrapLogin = async () => {
      try {
        const response = await apiFetch('/api/islogin');
        const data = await response.json();
        if (cancelled) return;

        setIsSkipAuth(Boolean(data?.isskip));

        if (data?.islogin) {
          router.replace('/');
          return;
        }

        if (data?.pendingInvitation) {
          router.replace('/login/invitation');
          return;
        }

        const loginUrl = typeof data?.loginUrl === 'string' ? data.loginUrl : '';
        if (loginUrl && !hasRedirectedRef.current) {
          hasRedirectedRef.current = true;
          window.location.replace(loginUrl);
          return;
        }

        setError('未获取到认证地址，请联系管理员检查登录配置');
      } catch (err) {
        console.error('初始化登录流程失败:', err);
        if (!cancelled) {
          setError('打开统一认证页失败，请稍后重试');
        }
      }
    };

    void bootstrapLogin();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <AuthShell
      eyebrow="Single Sign-On"
      title="即将进入统一认证"
      description="OfficeClaw 将把你带到华为云统一登录页，完成认证后会自动返回当前系统。"
    >
      <div className="space-y-6">
        <AuthLoadingAnimation
          label={error ? '正在重新准备登录环境' : FALLBACK_LOGIN_MESSAGE}
          detail={error || '如果浏览器没有自动跳转，请稍候片刻，系统会继续尝试。'}
        />

        <div className="rounded-2xl border border-[#F8DFC9] bg-[#FFF7F0] px-4 py-4 text-sm leading-6 text-[#7A4E2B]">
          当前登录页不再提供账号密码输入框，认证完成后会直接回到 OfficeClaw。
        </div>
      </div>
    </AuthShell>
  );
}
