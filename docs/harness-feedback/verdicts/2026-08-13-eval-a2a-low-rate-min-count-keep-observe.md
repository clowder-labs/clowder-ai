---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-08-13-eval-a2a-low-rate-min-count-keep-observe
source_snapshot: "snapshot:bundle/2026-08-13-eval-a2a-low-rate-min-count-keep-observe/snapshot"
---

# Live Verdict — 2026-08-13-eval-a2a-low-rate-min-count-keep-observe

- Verdict: `keep_observe`
- Phenomenon: No actionable A2A findings in the 23.96h runtime window. C2 verdict-without-pass reached the min-count floor at 3/1019 but remains a low-rate signal at 0.29%, C2 void-hold stayed 9/1022, and grounding shadow retention held at 10 samples with 0 mismatches.
- Harness: F167/C2 (exit-check (forced-pass guard))
- Owner ask: No F167 code action for this verdict; keep the daily eval active and watch whether C2 verdict_without_pass rises above the 5% rate floor, grounding sample_count drops below 10, mismatch_sample_count becomes non-zero, or legacy scheduled task IDs reappear.
- Re-eval: Next scheduled eval remains clean: finding_count 0, C2 verdict_without_pass rate below 5% even if count >= 3, C2 void-hold rate below 5%, grounding sample_count >= 10 with mismatch_sample_count 0, and legacyScheduledTaskIds remains empty. at 2026-08-14T03:00:00.000Z

Evidence:
- snapshot:bundle/2026-08-13-eval-a2a-low-rate-min-count-keep-observe/snapshot
- attribution:bundle/2026-08-13-eval-a2a-low-rate-min-count-keep-observe/eval-F167-2026-08-13:no-finding
- metric:c2.verdict_without_pass_count
- metric:c2.checked
- metric:c2.void_hold_hint_emitted
- metric:c2.void_hold_checked
- metric:grounding.sample_count
- metric:grounding.mismatch_sample_count
- metric:c1.hold_zombie_count
- metric:inline_action.shadow_miss
- C2/c2.verdict_without_pass_count/ed4f0c1fc3a50a3d

Counterarguments:
- C2 verdict_without_pass crossed the absolute min-count floor today, so treating it as flat depends on the denominator-normalized rate staying far below 5%.
- Only one retained per-fire sample is present for three C2 verdict_without_pass emissions, so sample coverage is incomplete even though aggregate attribution is below threshold.
- The trace window is 24h while counters span 594h, so counter-derived interpretation must continue to use counter_window rather than trace window duration.
