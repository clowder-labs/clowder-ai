/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useState } from 'react';
import type { MessageContent } from '@/stores/chatStore';
import { API_URL } from '@/utils/api-client';
import { Lightbox } from './Lightbox';
import { MarkdownContent } from './MarkdownContent';

export function ContentBlocks({ blocks }: { blocks: MessageContent[] }) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
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
          return <MarkdownContent key={i} content={block.text} />;
        }
        if (block.type === 'image') {
          const src = block.url.startsWith('/uploads/') ? `${API_URL}${block.url}` : block.url;
          return (
            // biome-ignore lint/performance/noImgElement: uploaded images cannot use next/image
            <img
              key={i}
              src={src}
              alt="attached image"
              className="max-w-full sm:max-w-sm rounded-lg mt-2 border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setLightboxSrc(src)}
            />
          );
        }
        if (block.type === 'file') {
          const href = block.url.startsWith('/uploads/') ? `${API_URL}${block.url}` : block.url;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex max-w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 transition-colors hover:bg-gray-50"
            >
              <img src={resolveIcon(block.fileName)} alt="" aria-hidden="true" className="h-8 w-8 shrink-0" />
              <div className="min-w-0">
                <div className="truncate text-sm text-[#191919]">{block.fileName}</div>
                <div className="text-xs text-gray-500">{block.mimeType || 'file'}</div>
              </div>
            </a>
          );
        }
        return null;
      })}
      {lightboxSrc && <Lightbox url={lightboxSrc} alt="attached image" onClose={() => setLightboxSrc(null)} />}
    </>
  );
}
