---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-07-05-eval-a2a-ordinary-monitoring-keep-observe
source_snapshot: "snapshot:bundle/2026-07-05-eval-a2a-ordinary-monitoring-keep-observe/snapshot"
---

# Live Verdict — 2026-07-05-eval-a2a-ordinary-monitoring-keep-observe

- Verdict: `keep_observe`
- Phenomenon: Current eval:a2a window has no actionable F167 A2A findings: C2 verdict-without-pass is 0/336 and C2 void-hold is 5/336 (1.5%), with a Wilson 95% upper bound around 3.4%. The 6/17-6/23 C2 regression remains recovered under ordinary monitoring; recurring incomplete per-fire sample coverage is an attribution-completeness concern rather than A2A chain-quality regression evidence.
- Harness: F167/a2a-harness (A2A chain quality harness (L1/C1/C2/route-serial))
- Owner ask: No A2A code action today. Keep eval:a2a in ordinary monitoring; if per-fire sample coverage remains incomplete in future clean rounds, split that into a separate F167 attribution-completeness work item rather than treating it as an A2A recovery blocker.
- Re-eval: Ordinary monitoring: keep the 6/17-6/23 C2 regression closed unless c2.verdict_without_pass_count >=3 and >=5%, or c2.void_hold_hint_emitted >=3 and >=5%, in a meaningful-volume window. Consider weekly cadence only after registry/SLA cadence is explicitly updated; until then keep the current scheduled eval contract. at 2026-07-08T03:01:22.013Z

Evidence:
- snapshot:bundle/2026-07-05-eval-a2a-ordinary-monitoring-keep-observe/snapshot
- attribution:bundle/2026-07-05-eval-a2a-ordinary-monitoring-keep-observe/eval-F167-2026-07-05:no-finding
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
- trace-store:spanCount=48:oldest=1783134191172:newest=1783220402361
- C2/c2.void_hold_hint_emitted/b2b0eff1fefe4332
- sampleCoverage:c2.void_hold_hint_emitted=1/5 sampled
- no-finding:Checked components L1,C1,C2,route-serial; all friction values within threshold

Counterarguments:
- Void-hold count is 5 today, but the point estimate is 1.5% and Wilson 95% high is about 3.4%, below the 5% floor.
- Current void-hold sample coverage is 1/5, so four fires cannot be trigger-classified from the artifact alone.
- Trace spanCount is low relative to counter volume, which reinforces that sample coverage is an observability concern separate from counter-based A2A recovery.
- Daily cadence may now be higher than needed for ordinary monitoring, but the registry/SLA still advertises a daily domain with 72h reeval expectation.
