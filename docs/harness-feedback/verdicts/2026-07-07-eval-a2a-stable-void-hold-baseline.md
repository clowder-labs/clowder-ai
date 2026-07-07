---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-07-07-eval-a2a-stable-void-hold-baseline
source_snapshot: "snapshot:bundle/2026-07-07-eval-a2a-stable-void-hold-baseline/snapshot"
---

# Live Verdict — 2026-07-07-eval-a2a-stable-void-hold-baseline

- Verdict: `keep_observe`
- Phenomenon: No actionable A2A finding in the 23.97h runtime window: C2 forced-pass remains 0/364 and void-hold is 8/364. The void-hold signal is converging on a stable non-zero baseline below the 5% floor, while per-fire sample coverage remains incomplete at 2/8.
- Harness: F167/C2 (exit-check (forced-pass guard))
- Owner ask: No F167 code action for this verdict; keep ordinary monitoring. If the 2026-07-08 eval again shows partial void-hold sample coverage, promote it as a separate tracer coverage/build work item to characterize the stable low baseline.
- Re-eval: Continue ordinary monitoring while C2 verdict_without_pass remains zero and void-hold ratio/Wilson upper bound stay below the 5% floor; split void-hold sample coverage into a separate tracer task if the 1/N-or-partial pattern persists on 2026-07-08. at 2026-07-10T03:01:28.927Z

Evidence:
- snapshot:bundle/2026-07-07-eval-a2a-stable-void-hold-baseline/snapshot
- attribution:bundle/2026-07-07-eval-a2a-stable-void-hold-baseline/eval-F167-2026-07-07:no-finding
- metric:c2.verdict_without_pass_count
- metric:c2.checked
- metric:c2.void_hold_hint_emitted
- metric:c2.void_hold_checked
- metric:inline_action.routed_set_skip
- metric:inline_action.feedback_written
- metric:inline_action.hint_emitted
- C2/c2.void_hold_hint_emitted/e6ebd78a80521cda
- C2/c2.void_hold_hint_emitted/86e6e04c4c158e0f

Counterarguments:
- Only 2 of 8 void-hold emissions have retained per-fire samples, so the exact composition of the baseline remains under-characterized.
- The domain registry still schedules daily evals; packet nextEvalAt follows the 72h SLA and does not change scheduler cadence.
- The point estimate rose to 2.2%; it is below threshold today, but a continued rise could become actionable in a later window.
