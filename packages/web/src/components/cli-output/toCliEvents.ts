/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { CliEvent, ToolEvent } from '@/stores/chat-types';

/** Strip "catId → " prefix from tool_use labels → clean tool name.
 *  e.g. "opus → Read" → "Read", "opus → Bash" → "Bash" */
function cleanToolLabel(label: string): string {
  const arrowIdx = label.indexOf(' → ');
  return arrowIdx >= 0 ? label.slice(arrowIdx + 3) : label;
}

function truncateArg(val: string, max = 60): string {
  return val.length > max ? `${val.slice(0, max - 3)}...` : val;
}

/** Regex patterns for extracting args from truncated JSON (safeJsonPreview truncates at 200 chars) */
const ARG_KEYS = ['file_path', 'command', 'pattern', 'url', 'query', 'prompt'] as const;

/** Extract primary argument from JSON tool input detail for inline display.
 *  Handles both valid and truncated JSON (common when safeJsonPreview cuts at 200 chars). */
function extractPrimaryArg(detail?: string): string | undefined {
  if (!detail) return undefined;
  try {
    const obj = JSON.parse(detail) as Record<string, unknown>;
    for (const key of ARG_KEYS) {
      const val = obj[key];
      if (typeof val === 'string' && val.length > 0) return truncateArg(val);
    }
    for (const val of Object.values(obj)) {
      if (typeof val === 'string' && val.length > 0 && val.length <= 80) return truncateArg(val);
    }
  } catch {
    // Truncated JSON — use regex to extract known arg values
    for (const key of ARG_KEYS) {
      const re = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`);
      const m = detail.match(re);
      if (m?.[1]) return truncateArg(m[1]);
    }
  }
  return undefined;
}

/** F097: Adapt existing ToolEvent[] + stream content → CliEvent[] unified timeline.
 *  Phase A: N tool events + 1 text block. Phase B: backend pushes CliEvent[] directly. */
export function toCliEvents(toolEvents: ToolEvent[] | undefined, streamContent: string | undefined): CliEvent[] {
  console.log('toolEvents', toolEvents);
  const events: CliEvent[] = [];

  if (toolEvents) {
    for (const te of toolEvents) {
      if (te.type === 'tool_use') {
        const toolName = cleanToolLabel(te.label);
        const primaryArg = extractPrimaryArg(te.detail);
        events.push({
          id: te.id,
          kind: te.type,
          timestamp: te.timestamp,
          label: primaryArg ? `${toolName} ${primaryArg}` : toolName,
          detail: te.detail,
          toolCallId: te.toolCallId,
        });
      } else {
        // tool_result: strip "catId ← result" label, keep detail
        events.push({
          id: te.id,
          kind: te.type,
          timestamp: te.timestamp,
          label: te.label,
          detail: te.detail,
          toolCallId: te.toolCallId,
        });
      }
    }
  }

  if (streamContent?.trim()) {
    events.push({
      id: 'stdout-text',
      kind: 'text',
      timestamp: events.length > 0 ? events[events.length - 1].timestamp + 1 : Date.now(),
      content: streamContent,
    });
  }

  return events;
}
