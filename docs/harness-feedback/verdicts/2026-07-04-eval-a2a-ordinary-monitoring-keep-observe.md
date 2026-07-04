---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-07-04-eval-a2a-ordinary-monitoring-keep-observe
source_snapshot: "snapshot:bundle/2026-07-04-eval-a2a-ordinary-monitoring-keep-observe/snapshot"
---

# Live Verdict — 2026-07-04-eval-a2a-ordinary-monitoring-keep-observe

- Verdict: `keep_observe`
- Phenomenon: Current eval:a2a window has no actionable F167 A2A findings in a high-volume sample: C2 verdict-without-pass is 0/325 and C2 void-hold is 4/325 (1.2%), with a Wilson 95% upper bound around 3.1%. The 6/17-6/23 C2 regression remains recovered under ordinary monitoring; attribution sample coverage is tracked separately from A2A chain quality.
- Harness: F167/a2a-harness (A2A chain quality harness (L1/C1/C2/route-serial))
- Owner ask: No A2A code action today. Keep eval:a2a in ordinary daily monitoring; treat per-fire sample coverage as a separate attribution-completeness concern and only re-open A2A recovery watch if a future meaningful-volume window crosses both count and ratio thresholds.
- Re-eval: Ordinary monitoring: continue daily reporting, but keep the 6/17-6/23 C2 regression closed unless c2.verdict_without_pass_count >=3 and >=5%, or c2.void_hold_hint_emitted >=3 and >=5%, in a meaningful-volume window. If void-hold per-fire sample coverage stays incomplete across future clean rounds, handle it as separate attribution coverage work rather than an A2A recovery blocker. at 2026-07-07T03:01:21.890Z

Evidence:
- snapshot:bundle/2026-07-04-eval-a2a-ordinary-monitoring-keep-observe/snapshot
- attribution:bundle/2026-07-04-eval-a2a-ordinary-monitoring-keep-observe/eval-F167-2026-07-04:no-finding
- metric:c1.zombie_hold_count
- metric:c1.hold_cancel_count
- metric:c2.verdict_without_pass_count
- metric:c2.checked
- metric:c2.void_hold_hint_emitted
- metric:c2.void_hold_checked
- metric:inline_action.checked
- metric:line_start.detected
- metric:inline_action.routed_set_skip
- metric:inline_action.feedback_written
- metric:inline_action.hint_emitted
- trace-store:spanCount=363:oldest=1783047790674:newest=1783133999958
- C2/c2.void_hold_hint_emitted/2fb113efec638003
- sampleCoverage:c2.void_hold_hint_emitted=1/4 sampled
- no-finding:Checked components L1,C1,C2,route-serial; all friction values within threshold

Counterarguments:
- Void-hold count is 4 today, so count-only logic would look noisy; the ratio and Wilson interval remain comfortably below the 5% floor.
- Current void-hold sample coverage is 1/4, so three fires cannot be trigger-classified from the artifact alone.
- Route-serial has three one-count background friction counters, all below threshold but worth retaining in telemetry.
- The persistent sample-coverage caveat should not keep A2A recovery at medium confidence; it is a separate attribution-completeness concern.
