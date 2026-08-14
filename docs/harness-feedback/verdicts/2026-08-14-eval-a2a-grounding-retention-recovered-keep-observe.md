---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-08-14-eval-a2a-grounding-retention-recovered-keep-observe
source_snapshot: "snapshot:bundle/2026-08-14-eval-a2a-grounding-retention-recovered-keep-observe/snapshot"
---

# Live Verdict — 2026-08-14-eval-a2a-grounding-retention-recovered-keep-observe

- Verdict: `keep_observe`
- Phenomenon: No actionable A2A findings in the 23.93h runtime window. Grounding shadow retention recovered to 32 samples with 0 mismatches, while C2 verdict-without-pass stayed 3/1215 and C2 void-hold rose to 12/1218 but remains below the 5% friction floor.
- Harness: F167/grounding-phase-o (claim grounding (Phase O shadow))
- Owner ask: No F167 code action for this verdict; keep the daily eval active and watch whether C2 void-hold approaches 5%, inline shadow_miss reaches the min-count floor, grounding mismatch_sample_count becomes non-zero, or legacy scheduled task IDs reappear.
- Re-eval: Next scheduled eval remains clean: finding_count 0, grounding sample_count >= 10 with mismatch_sample_count 0, C2 verdict_without_pass and void-hold rates below 5%, inline shadow_miss below actionable threshold or explained by attribution, and legacyScheduledTaskIds remains empty. at 2026-08-15T03:00:00.000Z

Evidence:
- snapshot:bundle/2026-08-14-eval-a2a-grounding-retention-recovered-keep-observe/snapshot
- attribution:bundle/2026-08-14-eval-a2a-grounding-retention-recovered-keep-observe/eval-F167-2026-08-14:no-finding
- metric:grounding.sample_count
- metric:grounding.mismatch_sample_count
- metric:c2.verdict_without_pass_count
- metric:c2.checked
- metric:c2.void_hold_hint_emitted
- metric:c2.void_hold_checked
- metric:c1.hold_zombie_count
- metric:inline_action.shadow_miss
- metric:inline_action.checked
- C2/c2.void_hold_hint_emitted/44299fbb459d0bc9

Counterarguments:
- C2 void-hold absolute count increased 9 to 12; the stable sub-1% rate supports keep_observe today but should remain in the daily trend.
- Inline shadow_miss increased 1 to 2; it is below min-count today but one more event may need closer review.
- The trace window is 24h while counters span 618h, so counter-derived interpretation must continue to use counter_window rather than trace window duration.
