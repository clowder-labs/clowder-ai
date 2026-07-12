---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-07-12-eval-a2a-denominator-recovered-clean-keep-observe
source_snapshot: "snapshot:bundle/2026-07-12-eval-a2a-denominator-recovered-clean-keep-observe/snapshot"
---

# Live Verdict — 2026-07-12-eval-a2a-denominator-recovered-clean-keep-observe

- Verdict: `keep_observe`
- Phenomenon: The 2026-07-12 eval:a2a window is clean with a recovered C2 denominator: forced-pass is 0/108, void-hold is 0/109, C1 zombie/cancel counters are 0, and grounding mismatch_sample_count is 0 across four stored grounding samples. The domain registry still has legacyScheduledTaskIds=[], so this daily run is not a duplicate legacy trigger.
- Harness: F167/C2 (A2A Chain Quality runtime harness: exit-check / void-hold / grounding shadow telemetry)
- Owner ask: No code action from this packet. Continue ordinary eval:a2a monitoring; promote a separate F167 build/fix ask only if a high-denominator window repeats void_hold drift above the 5% floor, verdict_without_pass returns, grounding mismatch_sample_count becomes positive with a recurring pattern, or sample coverage remains poor on recurring emissions.
- Re-eval: Keep daily eval active. Treat the regression as ordinary monitored until another high-denominator clean window keeps C2 void_hold/verdict_without_pass below the 5% floor and grounding mismatch_sample_count stays zero. at 2026-07-13T03:00:00.000Z

Evidence:
- snapshot:bundle/2026-07-12-eval-a2a-denominator-recovered-clean-keep-observe/snapshot
- attribution:bundle/2026-07-12-eval-a2a-denominator-recovered-clean-keep-observe/eval-F167-2026-07-12:no-finding
- metric:c2.verdict_without_pass_count
- metric:c2.checked
- metric:c2.void_hold_hint_emitted
- metric:c2.void_hold_checked
- metric:c1.hold_zombie_count
- metric:c1.hold_cancel_count
- metric:grounding.check_total
- metric:grounding.verdict_total
- metric:grounding.mismatch_sample_count
- metric:legacyScheduledTaskIds
- metadata:traceStoreStats/spanCount=534/counterWindowHours=12.13
- metadata:groundingSamples/stored=4/mismatch=0
- metadata:legacyScheduledTaskIds=0/legacyCleanup=disabled

Counterarguments:
- The day-over-day friction counts are flat at zero, so the improvement is mainly denominator/reliability rather than a lower count.
- The 7/11 durable packet is not present in this develop checkout, but GitHub shows PR #68 merged to main; this packet uses that as the prior durable thread baseline while publishing against origin/main.
- Grounding Phase O has no mismatches, but four insufficient samples indicate under-exercised resolver coverage rather than a reason to fail closed.
