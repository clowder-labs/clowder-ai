---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-07-19-eval-a2a-post-restart-clean-keep-observe
source_snapshot: "snapshot:bundle/2026-07-19-eval-a2a-post-restart-clean-keep-observe/snapshot"
---

# Live Verdict — 2026-07-19-eval-a2a-post-restart-clean-keep-observe

- Verdict: `keep_observe`
- Phenomenon: Current 23.97h eval:a2a trace window has no actionable F167 A2A findings. The API process restarted since yesterday, so the 12.08h counter window is a fresh baseline: C2 forced-pass and void-hold are both 0/40, C1 zombie is 0, and grounding shadow telemetry remains at zero mismatch samples while sample evidence increased to 67.
- Harness: F167/f167-runtime-eval (F167 A2A runtime eval telemetry)
- Owner ask: No code action today. Keep daily eval:a2a active; treat 2026-07-19 as a post-restart clean baseline and watch whether C2 forced-pass or void-hold reappears, whether C1 zombie increments again, or whether grounding mismatch_sample_count becomes nonzero.
- Re-eval: Next eval remains below the C2 5% ratio floor in the new post-restart counter window, with no C1 zombie increment and grounding mismatch_sample_count remaining 0. at 2026-07-20T03:00:00.000Z

Evidence:
- snapshot:bundle/2026-07-19-eval-a2a-post-restart-clean-keep-observe/snapshot
- attribution:bundle/2026-07-19-eval-a2a-post-restart-clean-keep-observe/eval-F167-2026-07-19:no-finding
- metric:c2.verdict_without_pass_count
- metric:c2.checked
- metric:c2.void_hold_hint_emitted
- metric:c2.void_hold_checked
- metric:c1.hold_zombie_count
- metric:grounding.check_total
- metric:grounding.verdict_total
- metric:grounding.mismatch_sample_count
- metadata:eval-F167-2026-07-19:no-finding

Counterarguments:
- Because OTel counters reset on process restart, absolute C2 counts cannot be directly subtracted from yesterday's cumulative 156h baseline.
- The current C2 denominator is only 40, so a single future event could move the rate more than in the prior high-denominator window.
- Grounding sample evidence is still all insufficient, so no mismatch pattern is good news but not a reason to promote shadow checks to fail-closed.
