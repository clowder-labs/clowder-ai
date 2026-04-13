/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { CatData } from '@/hooks/useCatData';
import { API_URL } from '@/utils/api-client';

export interface CatOption {
  id: string;
  label: string;
  desc: string;
  insert: string;
  color: string; // hex color (for inline style)
  avatar: string;
}

/** Build @mention autocomplete options from dynamic cat data.
 *  Filters out cats with no mentionPatterns (not routable via @mention). */
/** Format display label with optional variant disambiguation */
function formatCatLabel(cat: CatData): string {
  return cat.variantLabel ? `@${cat.displayName} (${cat.variantLabel})` : `@${cat.displayName}`;
}

function isAvailable(cat: CatData): boolean {
  return cat.roster?.available !== false;
}

function resolveCatAvatar(avatar: string): string {
  const trimmed = avatar.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('/uploads/') ? `${API_URL}${trimmed}` : trimmed;
}

export function buildCatOptions(cats: CatData[]): CatOption[] {
  return cats
    .filter((cat) => cat.mentionPatterns.length > 0 && isAvailable(cat))
    .map((cat) => ({
      id: cat.id,
      label: formatCatLabel(cat),
      desc: cat.roleDescription,
      insert: `@${cat.mentionPatterns[0].replace(/^@/, '')} `,
      color: cat.color.primary,
      avatar: resolveCatAvatar(cat.avatar),
    }));
}

/** Build whisper target options from dynamic cat data.
 *  Includes ALL cats — whisper routing accepts any catId regardless of mentionPatterns. */
export function buildWhisperOptions(cats: CatData[]): CatOption[] {
  return cats.filter(isAvailable).map((cat) => ({
    id: cat.id,
    label: formatCatLabel(cat),
    desc: cat.roleDescription,
    insert: cat.mentionPatterns.length > 0 ? `@${cat.mentionPatterns[0].replace(/^@/, '')} ` : '',
    color: cat.color.primary,
    avatar: resolveCatAvatar(cat.avatar),
  }));
}

/** Pure detection — returns menu trigger type from current input, or null. */
export function detectMenuTrigger(
  val: string,
  selectionStart: number,
): { type: 'mention'; start: number; filter: string } | null {
  const textBefore = val.slice(0, selectionStart);
  const atIdx = textBefore.lastIndexOf('@');
  if (atIdx >= 0) {
    const fragment = textBefore.slice(atIdx + 1);
    if (fragment.length <= 12 && !/\s/.test(fragment)) {
      return { type: 'mention', start: atIdx, filter: fragment };
    }
  }
  return null;
}
