/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { clearAuthIdentity, setCanCreateModel, setIsSkipAuth } from '@/utils/userId';

export function AppAuthBootstrap({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAuthReady(false);

    (async () => {
      try {
        const response = await apiFetch('/api/islogin');
        const data = await response.json();
        if (cancelled) return;

        // API 恢复后清除重试计数
        sessionStorage.removeItem('_auth_retry');

        setIsSkipAuth(Boolean(data?.isskip));
        setCanCreateModel(Boolean(data?.canCreateModel));
        if (data?.islogin) {
          setAuthReady(true);
          return;
        }

        clearAuthIdentity();
        window.location.replace('/login');
      } catch (error) {
        if (cancelled) return;
        console.error('检查登录状态失败:', error);
        clearAuthIdentity();

        // 用 sessionStorage 记录重试次数，防止 API 持续不可用时无限 reload
        const retries = Number(sessionStorage.getItem('_auth_retry') || '0');
        if (retries < 2) {
          sessionStorage.setItem('_auth_retry', String(retries + 1));
          setTimeout(() => {
            if (!cancelled) window.location.reload();
          }, 3000);
        } else {
          // 重试耗尽：回到统一 provider 登录页
          sessionStorage.removeItem('_auth_retry');
          window.location.replace('/login');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!authReady) {
    return null;
  }

  return <>{children}</>;
}
