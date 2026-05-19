/**
 * F153 Phase I: Step Summary aggregation.
 *
 * Computes per-route step metrics from a trace's stored spans. Descriptive
 * only (no efficiency or quality scoring, per KD-16/KD-32).
 *
 * Null sub-counts (`agent_loop_count` / `tool_call_count` / `a2a_dispatch_count`)
 * are returned when the trace is restored (flattened to
 * `cat_cafe.invocation.restored`, hierarchy lost) OR when no provider emitted
 * the `cat_cafe.agent_loop` marker. UI must render `—` for null, not `0`
 * (AC-I4 / AC-I7 non-degradation).
 */

import type { TraceSpanDTO } from './local-trace-store.js';

/** OTel SpanStatusCode.ERROR */
const SPAN_STATUS_ERROR = 2;

/** Step summary for one trace (one route). */
export interface StepSummary {
  traceId: string;
  /** Length: total agent loops in this route. null when restored or no provider marker. */
  agent_loop_count: number | null;
  /** Total tool calls (MCP child spans + basic-tool counter). null when restored. */
  tool_call_count: number | null;
  /** A2A dispatch count = number of cat_cafe.mention_dispatch spans. null when restored. */
  a2a_dispatch_count: number | null;
  /** Route duration in ms. Always available (route span or trace time-range fallback). */
  duration_ms: number;
  /** Total tokens from cat_cafe.route span attribute route.total_tokens. */
  token_total: number;
  /** Number of spans with ERROR status code. */
  error_count: number;
  /** Whether all invocation spans are restored (hierarchy lost). */
  is_restored: boolean;
  /** Width: avg tools per agent loop. null when either length or tool count is null. */
  width_avg_tools_per_loop: number | null;
}

/**
 * Aggregate spans of a single trace into a StepSummary. Returns null when no spans.
 *
 * NOTE: descriptive only — never compute efficiency / quality / normative scores
 * here. The UI must not synthesize such fields either (per AC-I5, KD-32).
 */
export function computeStepSummary(spans: TraceSpanDTO[], traceId: string): StepSummary | null {
  if (spans.length === 0) return null;

  const routeSpan = spans.find((s) => s.name === 'cat_cafe.route');
  const liveInvocationSpans = spans.filter((s) => s.name === 'cat_cafe.invocation');
  const restoredInvocationSpans = spans.filter((s) => s.name === 'cat_cafe.invocation.restored');

  // Restored when there are no live invocation spans but restored ones exist.
  const isRestored = liveInvocationSpans.length === 0 && restoredInvocationSpans.length > 0;

  // agent_loop_count: sum the `agent_loop.count` attribute across live invocation spans.
  // null when restored OR when no live invocation span exposed the attribute
  // (provider did not emit cat_cafe.agent_loop marker — AC-I2 non-degradation).
  let agentLoopCount: number | null = null;
  if (!isRestored) {
    const counts = liveInvocationSpans
      .map((s) => s.attributes['agent_loop.count'])
      .filter((v): v is number => typeof v === 'number');
    if (counts.length > 0) {
      agentLoopCount = counts.reduce((a, b) => a + b, 0);
    }
  }

  // tool_call_count: MCP/business child spans + basic-tool counter attribute (dual-track per KD-35).
  let toolCallCount: number | null = null;
  if (!isRestored) {
    const mcpToolUseSpans = spans.filter((s) => s.name.startsWith('cat_cafe.tool_use ')).length;
    const basicCounts = liveInvocationSpans
      .map((s) => s.attributes['tool.basic_call_count'])
      .filter((v): v is number => typeof v === 'number')
      .reduce((a, b) => a + b, 0);
    toolCallCount = mcpToolUseSpans + basicCounts;
  }

  // a2a_dispatch_count: count of cat_cafe.mention_dispatch spans (KD-34: derive from span, not metric counter).
  let a2aDispatchCount: number | null = null;
  if (!isRestored) {
    a2aDispatchCount = spans.filter((s) => s.name === 'cat_cafe.mention_dispatch').length;
  }

  // duration_ms: prefer route span duration; fallback to trace time range.
  const durationMs = routeSpan?.durationMs ?? computeTraceDuration(spans);

  // token_total: from route span (route.total_tokens), set in route-serial.ts finally block.
  const tokenTotal =
    routeSpan && typeof routeSpan.attributes['route.total_tokens'] === 'number'
      ? (routeSpan.attributes['route.total_tokens'] as number)
      : 0;

  // error_count: spans with ERROR status code.
  const errorCount = spans.filter((s) => s.status.code === SPAN_STATUS_ERROR).length;

  // Width: avg tools per loop.
  const width: number | null =
    agentLoopCount != null && agentLoopCount > 0 && toolCallCount != null ? toolCallCount / agentLoopCount : null;

  return {
    traceId,
    agent_loop_count: agentLoopCount,
    tool_call_count: toolCallCount,
    a2a_dispatch_count: a2aDispatchCount,
    duration_ms: durationMs,
    token_total: tokenTotal,
    error_count: errorCount,
    is_restored: isRestored,
    width_avg_tools_per_loop: width,
  };
}

function computeTraceDuration(spans: TraceSpanDTO[]): number {
  if (spans.length === 0) return 0;
  let start = Infinity;
  let end = -Infinity;
  for (const s of spans) {
    if (s.startTimeMs < start) start = s.startTimeMs;
    if (s.endTimeMs > end) end = s.endTimeMs;
  }
  return end - start;
}
