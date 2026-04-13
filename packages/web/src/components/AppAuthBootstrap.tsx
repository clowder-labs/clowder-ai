/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { setIsSkipAuth } from '@/utils/userId';

export function AppAuthBootstrap({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname === '/login';
  const [authReady, setAuthReady] = useState(isLoginRoute);

  useEffect(() => {
    if (isLoginRoute) {
      setAuthReady(true);
      return;
    }

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

        router.replace('/login');
      } catch (error) {
        if (cancelled) return;
        console.error('检查登录状态失败:', error);
        router.replace('/login');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoginRoute, router]);

  if (!authReady) {
    return null;
  }

  return <>{children}</>;
}
