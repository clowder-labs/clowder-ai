---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-07-13-eval-a2a-subthreshold-c2-regression-keep-observe
source_snapshot: "snapshot:bundle/2026-07-13-eval-a2a-subthreshold-c2-regression-keep-observe/snapshot"
---

# Live Verdict — 2026-07-13-eval-a2a-subthreshold-c2-regression-keep-observe

- Verdict: `keep_observe`
- Phenomenon: The 2026-07-13 eval:a2a window shows a small subthreshold C2 regression after the 7/12 clean window: forced-pass is 2/230 and void-hold is 4/231, while C1 zombie/cancel remain 0 and grounding mismatch_sample_count remains 0 across 11 stored grounding samples. The domain registry still has legacyScheduledTaskIds=[], so this daily run is not a duplicate legacy trigger.
- Harness: F167/C2 (A2A Chain Quality runtime harness: exit-check / void-hold / grounding shadow telemetry)
- Owner ask: No code action from this packet. Continue ordinary eval:a2a monitoring; promote a separate F167 fix/build ask only if C2 void_hold crosses the 5% floor on a high-denominator window, verdict_without_pass reaches actionable count with rate pressure, grounding mismatch_sample_count becomes positive with a recurring pattern, or sample coverage remains poor on recurring emissions.
- Re-eval: Keep daily eval active. Treat today as subthreshold watch; escalate only if the next high-denominator window sustains C2 friction above the finding gate or grounding mismatch_sample_count becomes positive. at 2026-07-14T03:00:00.000Z

Evidence:
- snapshot:bundle/2026-07-13-eval-a2a-subthreshold-c2-regression-keep-observe/snapshot
- attribution:bundle/2026-07-13-eval-a2a-subthreshold-c2-regression-keep-observe/eval-F167-2026-07-13:no-finding
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
- metadata:traceStoreStats/spanCount=780/counterWindowHours=36.12
- metadata:c2/verdictWithoutPass=2/230/voidHold=4/231
- metadata:groundingSamples/stored=11/mismatch=0
- metadata:legacyScheduledTaskIds=0/legacyCleanup=disabled

Counterarguments:
- Day-over-day direction is a real regression from 0/108 and 0/109 to 2/230 and 4/231, so calling this clean would hide a returning signal.
- The void-hold rate is still only 1.73%, below the 5% attribution floor and lower than the 7/7 prior drift point of 8/364, so actionable fix/build would be premature.
- Grounding Phase O has no mismatches but all samples are insufficient, so fail-closed escalation is not justified and resolver coverage remains a separate observation caveat.
