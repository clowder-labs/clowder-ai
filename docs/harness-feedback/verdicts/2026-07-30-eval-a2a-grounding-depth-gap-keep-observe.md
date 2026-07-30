---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-07-30-eval-a2a-grounding-depth-gap-keep-observe
source_snapshot: "snapshot:bundle/2026-07-30-eval-a2a-grounding-depth-gap-keep-observe/snapshot"
---

# Live Verdict — 2026-07-30-eval-a2a-grounding-depth-gap-keep-observe

- Verdict: `keep_observe`
- Phenomenon: No actionable A2A routing findings in the 2026-07-30 run: counter_window reached 258.11h, C2 forced-pass stayed 0, C1 zombie stayed 0, and the three void-hold hints stayed frozen while their rate diluted to 1.01%. Grounding shadow evidence quality regressed because retained sample depth fell from 8 to 6 with mismatch still 0/6, so the zero-mismatch signal remains low-depth evidence rather than high-confidence health proof.
- Harness: F167/grounding-phase-o (claim grounding (Phase O shadow))
- Owner ask: No F167 code action today. Keep daily eval running; if grounding sample_count drops to <=5 on the next run or remains <10 for five consecutive eval days, promote this retention-depth gap to a build verdict for grounding sample retention/capacity instrumentation.
- Re-eval: Next eval remains free of forced-pass and C1 zombie findings; no new void-hold emissions beyond the existing three; grounding sample depth recovers to at least 10 or the low-depth streak is counted toward the build-watch threshold. at 2026-07-31T03:00:00.000Z

Evidence:
- snapshot:bundle/2026-07-30-eval-a2a-grounding-depth-gap-keep-observe/snapshot
- attribution:bundle/2026-07-30-eval-a2a-grounding-depth-gap-keep-observe/eval-F167-2026-07-30:no-finding
- metric:counter_window.duration_hours
- metric:c2.verdict_without_pass_count
- metric:c2.checked
- metric:c2.void_hold_hint_emitted
- metric:c2.void_hold_checked
- metric:c1.hold_zombie_count
- metric:route_serial.inline_action.shadow_miss
- metric:grounding.check_total
- metric:grounding.verdict_total
- metric:grounding.mismatch_sample_count
- metric:grounding.sample_count
- metric:grounding.retention_depth_gap
- metric:legacyScheduledTaskIds
- metadata:eval-F167-2026-07-30:no-finding-retention-depth-gap

Counterarguments:
- C2 health is still improving by denominator dilution: forced-pass is 0/294 and void-hold is 3/296, so treating the whole domain as regressed would overstate A2A chain risk.
- Grounding mismatch count is 0, but only across 6 retained samples, so the zero-mismatch signal is too shallow for fail-closed or high-confidence health conclusions.
- The route-serial shadow_miss count is 1 and below the attribution gate; it should be watched but not treated as an actionable route-serial regression today.
