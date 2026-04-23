/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { CatId } from '@office-claw/shared';

export interface ParsedMention {
  targetCatId: CatId;
}

// ASCII + CJK full-width punctuation + brackets that can follow a mention
const MENTION_BOUNDARY_RIGHT = '[\\s,.:;!?，。！？；：、)\\]）】」』]';
// Left boundary: @ must not be preceded by word chars or dots (rejects email/domain)
const MENTION_BOUNDARY_LEFT = '(?<!\\w)';

function normalizeConnectorMentionText(text: string): string {
  return text.replaceAll('＠', '@');
}

/**
 * Parse @-mentions from external platform message text.
 * Returns the **first-in-text** matched cat or defaultCatId.
 *
 * @param text — inbound message text
 * @param allPatterns — Map<CatId, mentionPatterns[]> from officeClawRegistry
 * @param defaultCatId — fallback when no mention found
 */
export function parseMentions(text: string, allPatterns: Map<string, string[]>, defaultCatId: CatId): ParsedMention {
  const normalizedText = normalizeConnectorMentionText(text);
  let bestIndex = Infinity;
  let bestCatId: string | undefined;

  for (const [catId, patterns] of allPatterns) {
    for (const pattern of patterns) {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`${MENTION_BOUNDARY_LEFT}${escaped}(?=${MENTION_BOUNDARY_RIGHT}|$)`, 'i');
      const match = regex.exec(normalizedText);
      if (match && match.index < bestIndex) {
        bestIndex = match.index;
        bestCatId = catId;
      }
    }
  }

  return { targetCatId: (bestCatId ?? defaultCatId) as CatId };
}
