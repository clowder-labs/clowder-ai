/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

// biome-ignore lint/correctness/noUnusedImports: React needed for JSX in vitest environment
import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

type ViewMode = 'chat' | 'handoff' | 'raw';

interface ChatMessage {
  role: string;
  content: string;
  timestamp: number;
  invocationId?: string;
}

interface HandoffSummary {
  invocationId: string;
  eventCount: number;
  toolCalls: string[];
  errors: number;
  durationMs: number;
  keyMessages: string[];
}

interface RawEvent {
  eventNo: number;
  v: number;
  t: number;
  catId: string;
  event: Record<string, unknown>;
}

export interface SessionEventsViewerProps {
  sessionId: string;
  onClose: () => void;
}

const PAGE_SIZE = 30;

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m${sec % 60}s`;
}

const ROLE_STYLES: Record<string, string> = {
  user: 'bg-blue-50 text-blue-800',
  assistant: 'bg-purple-50 text-purple-800',
  system: 'bg-gray-50 text-gray-600',
};

export function SessionEventsViewer({ sessionId, onClose }: SessionEventsViewerProps) {
  const [view, setView] = useState<ViewMode>('chat');
  const [data, setData] = useState<ChatMessage[] | HandoffSummary[] | RawEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [cursorHistory, setCursorHistory] = useState<number[]>([]);

  const fetchEvents = useCallback(
    async (v: ViewMode, c: number) => {
      setLoading(true);
      setError(false);
      try {
        const res = await apiFetch(`/api/sessions/${sessionId}/events?view=${v}&cursor=${c}&limit=${PAGE_SIZE}`);
        if (!res.ok) {
          setError(true);
          return;
        }
        const json = await res.json();
        setTotal(json.total ?? 0);
        setNextCursor(json.nextCursor?.eventNo ?? null);

        if (v === 'chat') setData(json.messages ?? []);
        else if (v === 'handoff') setData(json.invocations ?? []);
        else setData(json.events ?? []);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [sessionId],
  );

  useEffect(() => {
    setData([]);
    setCursor(0);
    setCursorHistory([]);
    fetchEvents(view, 0);
  }, [view, fetchEvents]);

  const goNext = () => {
    if (nextCursor == null) return;
    setCursorHistory((h) => [...h, cursor]);
    setCursor(nextCursor);
    fetchEvents(view, nextCursor);
  };

  const goPrev = () => {
    if (cursorHistory.length === 0) return;
    const prev = cursorHistory[cursorHistory.length - 1];
    setCursorHistory((h) => h.slice(0, -1));
    setCursor(prev);
    fetchEvents(view, prev);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-700">Session 事件</span>
        <button
          type="button"
          data-testid="session-viewer-close"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          ✕
        </button>
      </div>

      {/* View mode tabs */}
      <div className="flex border-b border-gray-100">
        {(['chat', 'handoff', 'raw'] as const).map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => setView(m)}
            className={`flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors
              ${view === m ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            {m === 'chat' ? 'Chat' : m === 'handoff' ? 'Handoff' : 'Raw'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-72 overflow-y-auto p-2">
        {loading && <div className="text-xs text-gray-400 py-2">加载中...</div>}
        {error && <div className="text-xs text-red-500 py-2">加载失败</div>}

        {!loading && !error && view === 'chat' && (
          <div className="space-y-1.5">
            {(data as ChatMessage[]).map((msg, i) => (
              <div
                key={`${msg.role}-${msg.timestamp}-${i}`}
                className={`rounded px-2 py-1.5 text-[11px] ${ROLE_STYLES[msg.role] ?? 'bg-gray-50 text-gray-600'}`}
              >
                <span className="font-medium">{msg.role}</span>
                <p className="mt-0.5 whitespace-pre-wrap break-words">{msg.content}</p>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && view === 'handoff' && (
          <div className="space-y-1.5">
            {(data as HandoffSummary[]).map((inv) => (
              <div key={inv.invocationId} className="rounded border border-gray-100 px-2 py-1.5 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-gray-500">{inv.invocationId}</span>
                  <span className="text-gray-400">{fmtDuration(inv.durationMs)}</span>
                  {inv.errors > 0 && <span className="text-red-500">{inv.errors} err</span>}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(inv.toolCalls ?? []).map((t) => (
                    <span key={t} className="bg-gray-100 text-gray-600 px-1 py-0.5 rounded text-[10px]">
                      {t}
                    </span>
                  ))}
                </div>
                {(inv.keyMessages ?? []).length > 0 && (
                  <p className="text-gray-500 mt-1 truncate">{(inv.keyMessages ?? [])[0]}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && !error && view === 'raw' && (
          <div className="space-y-1">
            {(data as RawEvent[]).map((evt) => (
              <div key={evt.eventNo} className="text-[10px] font-mono bg-gray-50 rounded px-1.5 py-1">
                <span className="text-gray-400">#{evt.eventNo}</span>{' '}
                <span className="text-gray-600">{JSON.stringify(evt.event)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-100 text-[10px] text-gray-400">
        <span>{total} 条事件</span>
        <div className="flex gap-2">
          {cursorHistory.length > 0 && (
            <button type="button" onClick={goPrev} className="text-blue-500 hover:text-blue-700">
              上一页
            </button>
          )}
          {nextCursor != null && (
            <button type="button" onClick={goNext} className="text-blue-500 hover:text-blue-700">
              下一页
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
