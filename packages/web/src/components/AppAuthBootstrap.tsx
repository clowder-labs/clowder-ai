/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { clearAuthIdentity, setIsSkipAuth } from '@/utils/userId';

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

        setIsSkipAuth(Boolean(data?.isskip));
        if (data?.islogin) {
          setAuthReady(true);
          return;
        }

        clearAuthIdentity();
        const loginUrl = typeof data?.loginUrl === 'string' ? data.loginUrl : '';
        if (loginUrl) {
          window.location.replace(loginUrl);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('检查登录状态失败:', error);
        clearAuthIdentity();
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
