'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChatContainer } from '@/components/ChatContainer';
import { apiFetch } from '@/utils/api-client';
import { setUserId } from '@/utils/userId';

const DEV_AUTH_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === '1';

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(DEV_AUTH_BYPASS);
  const [isLoading, setIsLoading] = useState(!DEV_AUTH_BYPASS);
  const router = useRouter();

  useEffect(() => {
    if (DEV_AUTH_BYPASS) {
      setUserId('dev-user');
      return;
    }
    (async () => {
      try {
        const response = await apiFetch('/api/islogin');
        const data = await response.json();
        if (data.isLoggedIn) {
          setIsLoggedIn(true);
        } else {
          router.replace('/login');
        }
      } catch (err) {
        console.error('检查登录状态失败:', err);
        router.replace('/login');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return null; // 会被重定向，不渲染内容
  }

  return <ChatContainer threadId="default" />;
}
