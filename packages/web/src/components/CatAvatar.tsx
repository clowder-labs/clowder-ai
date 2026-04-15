/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useMemo, useState } from 'react';
import { useCatData } from '@/hooks/useCatData';
import { hexToRgba } from '@/lib/color-utils';
import { API_URL } from '@/utils/api-client';

type CatStatus = 'pending' | 'streaming' | 'done' | 'error' | 'alive_but_silent' | 'suspected_stall';

interface CatAvatarProps {
  catId: string;
  size?: number;
  status?: CatStatus;
  showRing?: boolean;
}

function catAvatarInitial(name?: string): string {
  const normalized = (name ?? '').replace(/^@/, '').trim();
  const first = normalized.slice(0, 1);
  return (first || '智').toUpperCase();
}

function isImageAvatarSrc(src: string): boolean {
  return /^(https?:\/\/|\/|data:image)/.test(src);
}

export function CatAvatar({ catId, size = 32, status, showRing = false }: CatAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const { getCatById } = useCatData();
  const cat = getCatById(catId);

  const isStreaming = status === 'streaming';
  const isError = status === 'error';
  const ringColor = cat?.color.primary ?? '#9CA3AF';
  const glowShadow = isStreaming && cat ? `0 0 10px ${hexToRgba(ringColor, 0.5)}` : undefined;

  const { avatarRaw, resolvedSrc, showImage } = useMemo(() => {
    const raw = cat?.avatar?.trim() ?? '';
    const fallbackPath = `/avatars/${catId}.png`;
    const base = raw || fallbackPath;
    const resolved = base.startsWith('/uploads/') ? `${API_URL}${base}` : base;
    const image = isImageAvatarSrc(resolved);
    return { avatarRaw: raw, resolvedSrc: resolved, showImage: image };
  }, [cat?.avatar, catId]);

  const fontSize = size <= 16 ? 10 : size <= 24 ? 11 : 12;

  return (
    <div
      className={`answer-avatar rounded-full flex-shrink-0 flex items-center justify-center transition-shadow duration-300 overflow-hidden ${
        showRing ? 'ring-2 ' : ''
      }${isStreaming ? 'animate-pulse' : ''}`}
      style={{
        width: size,
        height: size,
        ['--tw-ring-color' as string]: isError ? '#ef4444' : ringColor,
        boxShadow: glowShadow,
      }}
    >
      {showImage && !imgError ? (
        <img
          src={resolvedSrc}
          alt={cat?.displayName ?? catId}
          width={size}
          height={size}
          className="h-full w-full object-cover bg-gray-100"
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
          style={{
            backgroundColor: cat?.color?.primary ?? '#7AAEFF',
            fontSize,
            lineHeight: 1,
          }}
          aria-hidden={showImage ? true : undefined}
          title={cat?.displayName ?? catId}
        >
          {showImage && imgError
            ? catAvatarInitial(cat?.displayName ?? catId)
            : avatarRaw || catAvatarInitial(cat?.displayName ?? catId)}
        </div>
      )}
    </div>
  );
}
