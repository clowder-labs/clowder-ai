'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChatContainer } from '@/components/ChatContainer';
import { apiFetch } from '@/utils/api-client';
import { setIsSkipAuth } from '@/utils/userId';

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const response = await apiFetch('/api/islogin');
        const data = await response.json();
        setIsSkipAuth(Boolean(data?.isskip));
        if (data.islogin) {
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

  return <ChatContainer mode="new" />;
}
