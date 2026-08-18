---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-07-24-eval-a2a-long-stable-window-keep-observe
source_snapshot: "snapshot:bundle/2026-07-24-eval-a2a-long-stable-window-keep-observe/snapshot"
---

# Live Verdict — 2026-07-24-eval-a2a-long-stable-window-keep-observe

- Verdict: `keep_observe`
- Phenomenon: Current 23.95h eval:a2a trace window has no actionable F167 A2A findings. The post-restart counter window grew from 90.07h to 114.08h without reset; C2 forced-pass stayed 0/175, C2 void-hold stayed frozen at 3 while its denominator grew to 176 (1.70%), and C1 zombie plus grounding mismatch remain zero.
- Harness: F167/C2 (exit-check (forced-pass / void-hold guards))
- Owner ask: No code or frequency action today. Keep daily eval:a2a active; continue watching that void-hold remains frozen or diluting, counter_window continues to grow, forced-pass/C1 zombie/grounding mismatch remain zero, and grounding sample_count does not collapse into single-digit no-data territory.
- Re-eval: Next eval keeps C2 forced-pass at 0, C2 void-hold at or below 3 and below the 5% ratio floor, C1 zombie at 0, grounding mismatch at 0, counter_window grows without reset, and grounding sample_count remains sufficient for shadow-mode interpretation or is explicitly flagged as retention-depth telemetry gap. at 2026-07-25T03:00:00.000Z

Evidence:
- snapshot:bundle/2026-07-24-eval-a2a-long-stable-window-keep-observe/snapshot
- attribution:bundle/2026-07-24-eval-a2a-long-stable-window-keep-observe/eval-F167-2026-07-24:no-finding
- metric:c2.verdict_without_pass_count
- metric:c2.void_hold_hint_emitted
- metric:c1.hold_zombie_count
- metric:grounding.mismatch_sample_count
- metric:grounding.sample_count
- metric:counter_window.duration_hours
- metadata:eval-F167-2026-07-24:no-finding

Counterarguments:
- Clean windows do not prove sunset readiness; F192 requires original failure-pattern probes and a Sunset Trial Plan for delete_sunset.
- Trace retention can drop span/sample counts while process counters continue since boot, so span_count and sample_count drops are not automatic behavior regressions.
- The C2 void-hold raw count still equals the minimum-count threshold, so continued daily monitoring is justified despite the low ratio.
