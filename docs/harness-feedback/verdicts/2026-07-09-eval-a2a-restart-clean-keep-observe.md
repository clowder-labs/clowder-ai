---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-07-09-eval-a2a-restart-clean-keep-observe
source_snapshot: "snapshot:bundle/2026-07-09-eval-a2a-restart-clean-keep-observe/snapshot"
---

# Live Verdict — 2026-07-09-eval-a2a-restart-clean-keep-observe

- Verdict: `keep_observe`
- Phenomenon: The 2026-07-09 window is clean on current counters: C2 forced-pass is 0/61 and void-hold is 0/61, with no C1 zombie-hold finding and no grounding mismatches. Trend interpretation is downgraded because the API process restarted during the trace window: trace coverage is 21.62h, but counter_window is 18.80h and the C2 denominator is far below the prior high-traffic windows.
- Harness: F167/C2 (A2A Chain Quality runtime harness: exit-check / void-hold / grounding shadow telemetry)
- Owner ask: No code action from this 7/9 packet. Continue ordinary eval:a2a monitoring; if the next high-denominator window returns void_hold above roughly 2.5% or keeps per-fire sample coverage below 80%, promote a separate F167 tracer coverage build ask before the 5% floor is crossed.
- Re-eval: Keep ordinary monitoring while verdict_without_pass stays at zero or isolated low counts, void_hold remains below the 5% floor, and grounding mismatch_sample_count remains zero. Reopen as build if a full counter window repeats the 7/8 drift shape or if sample coverage remains below 80% on recurring void_hold emissions. at 2026-07-10T03:01:28Z

Evidence:
- snapshot:bundle/2026-07-09-eval-a2a-restart-clean-keep-observe/snapshot
- attribution:bundle/2026-07-09-eval-a2a-restart-clean-keep-observe/eval-F167-2026-07-09:no-finding
- metric:c2.verdict_without_pass_count
- metric:c2.checked
- metric:c2.void_hold_hint_emitted
- metric:c2.void_hold_checked
- metric:inline_action.checked
- metric:grounding.check_total
- metric:grounding.mismatch_sample_count
- metadata:traceStoreStats/spanCount=321/counterWindowHours=18.80

Counterarguments:
- The 7/9 C2 denominator is only 61 after a process restart, while 7/8 had 551 checks; 0/61 should not be interpreted as a statistically strong improvement over 14/551.
- The 7/3-7/8 sequence rose monotonically from 1.21% to 2.54%, so one low-denominator clean window does not erase the drift hypothesis.
- No void_hold sample rows exist in 7/9 because no void_hold events fired; the persistent sample coverage question is therefore not resolved by this packet.
- Grounding shadow telemetry reported zero checks and zero samples; that is healthy for mismatch count, but does not prove the grounding path was exercised by stateful tool calls in this window.
