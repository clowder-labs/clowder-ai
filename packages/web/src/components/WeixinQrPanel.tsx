'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { CheckCircleIcon, SpinnerIcon } from './HubConfigIcons';

type QrState = 'idle' | 'fetching' | 'waiting' | 'scanned' | 'confirmed' | 'error' | 'expired';

const QR_POLL_INTERVAL_MS = 2500;
const QR_EXPIRE_MS = 60_000;

export function WeixinQrPanel({
  configured,
  onConfigured,
}: {
  configured: boolean;
  onConfigured?: () => void | Promise<void>;
}) {
  const [qrState, setQrState] = useState<QrState>(configured ? 'confirmed' : 'idle');
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expireRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (expireRef.current) {
      clearTimeout(expireRef.current);
      expireRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    if (configured) {
      stopPolling();
      setQrState('confirmed');
      setQrUrl(null);
      setErrorMsg(null);
    }
  }, [configured, stopPolling]);

  const startPolling = useCallback(
    (payload: string) => {
      stopPolling();

      const poll = async () => {
        try {
          const res = await apiFetch(`/api/connector/weixin/qrcode-status?qrPayload=${encodeURIComponent(payload)}`);
          if (!res.ok) return;
          const data = await res.json();

          if (data.status === 'scanned') {
            setQrState('scanned');
          } else if (data.status === 'confirmed') {
            stopPolling();
            setQrState('confirmed');
            setQrUrl(null);
            setErrorMsg(null);
            await onConfigured?.();
          } else if (data.status === 'expired') {
            stopPolling();
            setQrState('expired');
            setQrUrl(null);
          }
        } catch {
          /* network hiccup — keep polling */
        }
      };

      pollRef.current = setInterval(poll, QR_POLL_INTERVAL_MS);
      poll();

      expireRef.current = setTimeout(() => {
        stopPolling();
        setQrState('expired');
        setQrUrl(null);
      }, QR_EXPIRE_MS);
    },
    [onConfigured, stopPolling],
  );

  const handleFetchQr = async () => {
    setQrState('fetching');
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/connector/weixin/qrcode', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setQrState('error');
        setErrorMsg(data.error ?? 'Failed to fetch QR code');
        return;
      }
      const data = await res.json();
      setQrUrl(data.qrUrl);
      setQrState('waiting');
      startPolling(data.qrPayload);
    } catch {
      setQrState('error');
      setErrorMsg('网络错误');
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/connector/weixin/disconnect', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? '解除绑定失败');
        return;
      }
      stopPolling();
      setQrState('idle');
      setQrUrl(null);
    } catch {
      setErrorMsg('网络错误');
    } finally {
      setDisconnecting(false);
    }
  };

  if (qrState === 'confirmed') {
    return (
      <div className="space-y-2">
        <div
          className="flex items-center gap-2 bg-[#f5f5f5] border border-[var(--card-border)] rounded-lg px-3 py-2.5 w-[60%]"
          data-testid="weixin-connected"
        >
          <span className="text-green-600">
            <CheckCircleIcon />
          </span>
          <span className="text-sm font-medium text-green-700">微信已连接</span>
        </div>
        {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-semibold text-red-700 transition-colors disabled:opacity-60"
          data-testid="weixin-disconnect"
        >
          {disconnecting ? '解除绑定中...' : '解除绑定'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="weixin-qr-panel">
      {(qrState === 'idle' || qrState === 'expired' || qrState === 'error') && (
        <div className="space-y-2">
          {qrState === 'expired' && (
            <p className="text-xs text-amber-600">二维码已过期，请重新生成</p>
          )}
          {qrState === 'error' && errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}
          <button
            type="button"
            onClick={handleFetchQr}
            className="ui-button-primary"
            data-testid="weixin-generate-qr"
          >
            {qrState === 'expired' ? '重新生成二维码' : '生成二维码'}
          </button>
        </div>
      )}

      {qrState === 'fetching' && (
        <div className="flex items-center gap-2 text-sm">
          <SpinnerIcon />
          <span>二维码生成中...</span>
        </div>
      )}

      {(qrState === 'waiting' || qrState === 'scanned') && qrUrl && (
        <div className="flex flex-col gap-3" style={{ width: 'fit-content' }}>
          <div className='p-3 border-[#f0f0f0] bg-[#fff]' style={{ boxShadow: '0 4px 16px 0 rgba(0,0,0,0.08)' }}>
            <img src={qrUrl} alt="WeChat login QR code" className="w-48 h-48 rounded-lg" data-testid="weixin-qr-image" />
          </div>
          {qrState === 'waiting' && (
            <div className="flex items-center justify-center gap-2 text-gray-500 text-xs">
              <SpinnerIcon />
              <span>用微信扫描二维码</span>
            </div>
          )}
          {qrState === 'scanned' && (
            <div className="flex items-center gap-2 text-green-600 text-xs font-medium">
              <SpinnerIcon />
              <span>已扫描！请在手机上确认...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
