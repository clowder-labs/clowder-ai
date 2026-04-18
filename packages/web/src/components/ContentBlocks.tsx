/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useState } from 'react';
import type { MessageContent } from '@/stores/chatStore';
import { apiFetch, API_URL } from '@/utils/api-client';
import { Lightbox } from './Lightbox';
import { MarkdownContent } from './MarkdownContent';

function resolveMediaUrl(url: string): string {
  return url.startsWith('/uploads/') || url.startsWith('/api/') ? `${API_URL}${url}` : url;
}

function getWorkspaceTarget(url: string): { worktreeId: string; path: string } | null {
  if (!url.startsWith('/api/workspace/download?')) return null;
  const query = url.split('?')[1];
  if (!query) return null;

  const params = new URLSearchParams(query);
  const worktreeId = params.get('worktreeId');
  const path = params.get('path');
  return worktreeId && path ? { worktreeId, path } : null;
}

export function ContentBlocks({
  blocks,
  enableSkillAndQuickActionTokens = false,
  showFileAction = true,
}: {
  blocks: MessageContent[];
  enableSkillAndQuickActionTokens?: boolean;
  showFileAction?: boolean;
}) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [openingFileUrl, setOpeningFileUrl] = useState<string | null>(null);
  const resolveIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'pdf') return '/icons/file-pdf.svg';
    if (ext === 'doc' || ext === 'docx') return '/icons/file-docx.svg';
    if (ext === 'xls' || ext === 'xlsx') return '/icons/file-xlsx.svg';
    if (ext === 'ppt' || ext === 'pptx') return '/icons/file-ppt.svg';
    if (ext === 'csv') return '/icons/file-csv.svg';
    if (ext === 'txt') return '/icons/file-txt.svg';
    return '/icons/file-html.svg';
  };
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'text') {
          return (
            <MarkdownContent
              key={i}
              content={block.text}
              enableSkillAndQuickActionTokens={enableSkillAndQuickActionTokens}
            />
          );
        }
        if (block.type === 'image') {
          const src = resolveMediaUrl(block.url);
          return (
            // biome-ignore lint/performance/noImgElement: uploaded images cannot use next/image
            <img
              key={i}
              src={src}
              alt="attached image"
              className="mt-2 max-w-full cursor-pointer rounded-lg border border-[var(--border-default)] transition-opacity hover:opacity-90 sm:max-w-sm"
              onClick={() => setLightboxSrc(src)}
            />
          );
        }
        if (block.type === 'file') {
          const href = resolveMediaUrl(block.url);
          const workspaceTarget = getWorkspaceTarget(block.url);
          const shouldShowWorkspaceAction = showFileAction && workspaceTarget;
          return (
            <div
              key={i}
              className="mt-2 flex max-w-full items-center gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-panel)] px-3 py-2"
            >
              <img src={resolveIcon(block.fileName)} alt="" aria-hidden="true" className="h-8 w-8 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-[var(--text-primary)]">{block.fileName}</div>
                <div className="text-xs text-[var(--text-label-secondary)]">{block.mimeType || 'file'}</div>
              </div>
              {shouldShowWorkspaceAction ? (
                <button
                  type="button"
                  className="shrink-0 rounded-full border border-[var(--border-default)] px-3 py-1 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--overlay-item-hover-bg)]"
                  onClick={() => {
                    setOpeningFileUrl(block.url);
                    void apiFetch('/api/workspace/open', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(workspaceTarget),
                    }).finally(() => setOpeningFileUrl((current) => (current === block.url ? null : current)));
                  }}
                >
                  {openingFileUrl === block.url ? '打开中...' : '打开'}
                </button>
              ) : showFileAction ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-full border border-[var(--border-default)] px-3 py-1 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--overlay-item-hover-bg)]"
                >
                  下载
                </a>
              ) : null}
            </div>
          );
        }
        return null;
      })}
      {lightboxSrc && <Lightbox url={lightboxSrc} alt="attached image" onClose={() => setLightboxSrc(null)} />}
    </>
  );
}
