/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { ConnectorConnectedState } from './ConnectorConnectedState';
import { SpinnerIcon } from './HubConfigIcons';

type QrState = 'idle' | 'fetching' | 'waiting' | 'confirmed' | 'error' | 'expired' | 'denied';

interface FeishuQrPanelProps {
  configured: boolean;
  onConfirmed?: () => void;
  onDisconnected?: () => void;
}

function statusMessage(status: QrState, errorMsg: string | null) {
  if (status === 'expired') return '二维码已过期，请重新生成';
  if (status === 'denied') return '授权被拒绝，请重试并在飞书上确认';
  if (status === 'error') return errorMsg ?? '获取二维码失败';
  return null;
}

export function FeishuQrPanel({ configured, onConfirmed, onDisconnected }: FeishuQrPanelProps) {
  const [qrState, setQrState] = useState<QrState>(configured ? 'confirmed' : 'idle');
  const [disconnecting, setDisconnecting] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminalRef = useRef(false);
  const requestSeqRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    terminalRef.current = configured;
    setQrState(configured ? 'confirmed' : 'idle');
    if (configured) {
      stopPolling();
      setQrUrl(null);
      setErrorMsg(null);
    }
  }, [configured, stopPolling]);
  useEffect(() => () => stopPolling(), [stopPolling]);

  const schedulePoll = useCallback(
    (payload: string, intervalMs: number) => {
      stopPolling();
      terminalRef.current = false;

      const poll = async () => {
        if (terminalRef.current) return;

        const requestId = ++requestSeqRef.current;
        try {
          const res = await apiFetch(`/api/connector/feishu/qrcode-status?qrPayload=${encodeURIComponent(payload)}`);
          if (!res.ok) {
            pollRef.current = setTimeout(poll, intervalMs);
            return;
          }
          const data = await res.json();
          if (terminalRef.current || requestId !== requestSeqRef.current) return;

          if (data.status === 'waiting') {
            pollRef.current = setTimeout(poll, intervalMs);
            return;
          }

          stopPolling();
          terminalRef.current = true;

          if (data.status === 'confirmed' || data.status === 'expired' || data.status === 'denied') {
            setQrState(data.status);
            setQrUrl(null);
            if (data.status === 'confirmed') {
              setErrorMsg(null);
              onConfirmed?.();
            }
            return;
          }
          setQrState('error');
          setErrorMsg('Unexpected QR status');
          setQrUrl(null);
        } catch {
          if (terminalRef.current || requestId !== requestSeqRef.current) return;
          pollRef.current = setTimeout(poll, intervalMs);
        }
      };

      poll();
    },
    [onConfirmed, stopPolling],
  );

  const handleFetchQr = async () => {
    stopPolling();
    terminalRef.current = false;
    setQrState('fetching');
    setErrorMsg(null);

    try {
      const res = await apiFetch('/api/connector/feishu/qrcode', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setQrState('error');
        setErrorMsg(data.error ?? 'Failed to fetch QR code');
        return;
      }

      const data = await res.json();
      setQrUrl(data.qrUrl);
      setQrState('waiting');
      schedulePoll(data.qrPayload, data.intervalMs ?? 2500);
    } catch {
      setQrState('error');
      setErrorMsg('网络错误');
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await apiFetch('/api/connector/feishu/disconnect', { method: 'POST' });
      if (res.ok) {
        setQrState('idle');
        onDisconnected?.();
      }
    } catch {
      // button stays enabled for retry
    } finally {
      setDisconnecting(false);
    }
  };

  if (qrState === 'confirmed') {
    return (
      <div data-testid="feishu-connected">
        <ConnectorConnectedState
          label="Feishu connected"
          disconnecting={disconnecting}
          onDisconnect={handleDisconnect}
          disconnectTestId="feishu-disconnect"
        >
        </ConnectorConnectedState>
      </div>
    );
  }

  const message = statusMessage(qrState, errorMsg);

  return (
    <div className="space-y-3" data-testid="feishu-qr-panel">
      {(qrState === 'idle' || qrState === 'expired' || qrState === 'error' || qrState === 'denied') && (
        <div className="space-y-2">
          {message && <p className="text-xs text-gray-500">{message}</p>}
          <button
            type="button"
            onClick={handleFetchQr}
            className="ui-button-primary"
            data-testid="feishu-generate-qr"
          >
            {qrState === 'idle' ? '生成二维码' : '重新生成二维码'}
          </button>
        </div>
      )}

      {qrState === 'fetching' && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <SpinnerIcon />
          <span>二维码生成中...</span>
        </div>
      )}

      {qrState === 'waiting' && qrUrl && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <img src={qrUrl} alt="Feishu QR code" className="h-48 w-48 rounded-lg" data-testid="feishu-qr-image" />
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <SpinnerIcon />
            <span>用飞书扫描二维码并确认授权</span>
          </div>
        </div>
      )}
    </div>
  );
}
