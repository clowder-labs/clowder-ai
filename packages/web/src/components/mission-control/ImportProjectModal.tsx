/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

interface ImportProjectModalProps {
  onClose: () => void;
  onImported: () => void;
}

export function ImportProjectModal({ onClose, onImported }: ImportProjectModalProps) {
  const [name, setName] = useState('');
  const [sourcePath, setSourcePath] = useState('');
  const [backlogPath, setBacklogPath] = useState('docs/ROADMAP.md');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async () => {
    if (!name.trim() || !sourcePath.trim()) {
      setError('项目名称和路径不能为空');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/external-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), sourcePath: sourcePath.trim(), backlogPath, description }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `创建失败: ${res.status}`);
      }
      onImported();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop-medium)]">
      <div
        className="w-full max-w-md rounded-xl border border-[var(--modal-border)] bg-[var(--modal-surface)] p-6 shadow-[var(--modal-shadow)]"
      >
        <h2 className="mb-4 text-base font-bold text-[var(--modal-title-text)]">导入项目</h2>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-[var(--modal-text-muted)]">项目名称 *</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. studio-flow"
              className="ui-input ui-input-soft mt-1 w-full rounded-lg px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[var(--modal-text-muted)]">项目路径 *</span>
            <input
              type="text"
              value={sourcePath}
              onChange={(e) => setSourcePath(e.target.value)}
              placeholder="/home/user/studio-flow"
              className="ui-input ui-input-soft mt-1 w-full rounded-lg px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[var(--modal-text-muted)]">Backlog 路径</span>
            <input
              type="text"
              value={backlogPath}
              onChange={(e) => setBacklogPath(e.target.value)}
              className="ui-input ui-input-soft mt-1 w-full rounded-lg px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[var(--modal-text-muted)]">描述</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述"
              className="ui-input ui-input-soft mt-1 w-full rounded-lg px-3 py-2 text-sm"
            />
          </label>
        </div>

        {error && (
          <div className="ui-status-error mt-3 rounded-lg border px-3 py-2 text-xs">{error}</div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="ui-button-default rounded-lg px-4 py-1.5 text-xs font-medium"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="ui-button-primary rounded-lg px-4 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            {submitting ? '导入中...' : '导入'}
          </button>
        </div>
      </div>
    </div>
  );
}
