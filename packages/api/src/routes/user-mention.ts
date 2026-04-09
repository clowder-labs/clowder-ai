/**
 * F057-C2: Detect co-creator (@co-creator / @铲屎官 / configured) mention at line start.
 *
 * Same convention as cat @mentions: line-start only, code blocks stripped.
 * OQ-1 + R2-P2: Token boundary — reject ASCII letter/digit/underscore continuation
 * (e.g. @co-creator123, @co-creator123) but allow CJK text (e.g. @co-creator请看, @铲屎官请看).
 *
 * F067 co-creator config: patterns read from cat-config.json coCreator.mentionPatterns,
 * with @co-creator/@铲屎官 always included as fallback defaults.
 */

import { getCoCreatorMentionPatterns } from '../config/cat-config-loader.js';
import { createModuleLogger } from '../infrastructure/logger.js';

const log = createModuleLogger('user-mention');

/** Reject if followed by ASCII word character (letter/digit/underscore) */
const CONTINUATION_RE = /^[a-zA-Z0-9_]/;

export function detectUserMention(text: string): boolean {
  const patterns = getCoCreatorMentionPatterns();
  // Strip fenced code blocks
  const stripped = text.replace(/```[\s\S]*?```/g, '');
  const lines = stripped.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trimStart().toLowerCase();
    for (const pattern of patterns) {
      if (trimmed.startsWith(pattern)) {
        const rest = trimmed.slice(pattern.length);
        if (!CONTINUATION_RE.test(rest)) {
          log.debug({ pattern, lineSnippet: line.slice(0, 60) }, 'Co-creator mention detected');
          return true;
        }
        log.debug({ pattern, rest: rest.slice(0, 10) }, 'Co-creator pattern matched but boundary failed');
      }
    }
  }
  return false;
}
