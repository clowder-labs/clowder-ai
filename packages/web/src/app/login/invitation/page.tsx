/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { setAuthIdentity, setIsSkipAuth } from '@/utils/userId';

type InvitationResponse = {
  success?: boolean;
  needCode?: boolean;
  userId?: string;
  userName?: string;
  message?: string;
  redirectTo?: string;
  islogin?: boolean;
  pendingInvitation?: boolean;
  isskip?: boolean;
};

export default function InvitationPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [promotionCode, setPromotionCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const checkState = async () => {
      try {
        const response = await apiFetch('/api/islogin');
        const data = (await response.json()) as InvitationResponse;
        if (cancelled) return;

        setIsSkipAuth(Boolean(data?.isskip));

        if (data?.islogin) {
          router.replace('/');
          return;
        }

        if (!data?.pendingInvitation) {
          router.replace('/login');
          return;
        }

        setIsReady(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      } catch (err) {
        console.error('检查邀请码状态失败:', err);
        if (!cancelled) {
          router.replace('/login');
        }
      }
    };

    void checkState();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = promotionCode.trim();
    if (!code) {
      setError('请输入邀请码');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await apiFetch('/api/login/invitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ promotionCode: code }),
      });

      const data = (await response.json()) as InvitationResponse;
      if (!response.ok || !data?.success || !data.userId) {
        setError(data?.message || '邀请码校验失败，请稍后重试');
        if (data?.needCode) {
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }
        return;
      }

      setAuthIdentity({ userId: data.userId, userName: data.userName });
      router.replace(data.redirectTo || '/');
    } catch (err) {
      console.error('提交邀请码失败:', err);
      setError('邀请码校验失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(255,161,109,0.15),transparent_38%),radial-gradient(circle_at_left_center,_rgba(255,200,170,0.14),transparent_28%),radial-gradient(circle_at_right_center,_rgba(255,221,186,0.18),transparent_30%),linear-gradient(180deg,_#FFFDFB_0%,_#FFFFFF_52%,_#FFF9F4_100%)] px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-[920px] items-center justify-center">
        <div className="w-full max-w-[480px]">
          <div className="space-y-10 rounded-[36px] border border-white/70 bg-white/55 px-8 py-10 shadow-[0_24px_100px_-56px_rgba(246,122,73,0.38)] backdrop-blur-[10px] sm:px-10 sm:py-12">
            <div className="space-y-4 text-left">
              <h1 className="text-[30px] font-bold tracking-[-0.03em] text-[#1F2937] sm:text-[38px]">
                欢迎体验{' '}
                <span className="bg-[linear-gradient(90deg,_#FF8A1F_0%,_#FF6B33_48%,_#D93F8D_100%)] bg-clip-text text-transparent">
                  OfficeClaw
                </span>
              </h1>
              <p className="text-sm leading-6 text-[#4B5563]">
                当前我们正在进行小规模内测。想要开始体验，请在下方输入你的邀请码。
              </p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-3">
                <label htmlFor="promotionCode" className="text-sm font-medium text-[#374151]">
                  邀请码
                </label>
                <input
                  ref={inputRef}
                  id="promotionCode"
                  name="promotionCode"
                  type="text"
                  autoComplete="off"
                  disabled={!isReady || isLoading}
                  className="block h-12 w-full rounded-xl border border-[#E7DDD4] bg-white/90 px-4 text-sm text-[#111827] outline-none transition placeholder:text-[#C4B5A5] focus:border-[#D9864B] focus:ring-4 focus:ring-[#FCE8D6] disabled:cursor-not-allowed disabled:bg-[#F8F5F1]"
                  placeholder="请输入邀请码"
                  value={promotionCode}
                  onChange={(event) => setPromotionCode(event.target.value)}
                />
                <p className="text-xs leading-6 text-[#9CA3AF]">
                  没有邀请码？可以联系 OfficeClaw 团队获取产品体验邀请码
                  <span className="ml-1 font-medium text-[#5B9CFF]">获取邀请码</span>
                </p>
              </div>

              {error ? (
                <div className="rounded-2xl border border-[#F3C6C6] bg-[#FFF5F5] px-4 py-3 text-sm text-[#B42318]">
                  {error}
                </div>
              ) : null}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!isReady || isLoading}
                  className="mx-auto flex h-12 w-full max-w-[200px] items-center justify-center rounded-full bg-[#171717] px-6 text-sm font-semibold text-white transition hover:bg-[#262626] disabled:cursor-not-allowed disabled:bg-[#D1D5DB]"
                >
                  {isLoading ? '校验中...' : '立即体验'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
