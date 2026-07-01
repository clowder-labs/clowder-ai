---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-07-01-eval-a2a-c2-recovery-keep-observe
source_snapshot: "snapshot:bundle/2026-07-01-eval-a2a-c2-recovery-keep-observe/snapshot"
---

# Live Verdict — 2026-07-01-eval-a2a-c2-recovery-keep-observe

- Verdict: `keep_observe`
- Phenomenon: Current eval:a2a window has no actionable F167 A2A findings: C2 verdict-without-pass is 0/78 and C2 void-hold is 2/78 (2.6%), below both the count threshold and the 5% reporting floor. This is a second consecutive meaningful-volume window (6/30 n=22, 7/1 n=78) with void-hold point estimate at or below the floor, so the 6/17-6/23 C2 regression is behaving as recovered while still needing ordinary observation.
- Harness: F167/a2a-harness (A2A chain quality harness (L1/C1/C2/route-serial))
- Owner ask: No code action today. Treat the 6/17-6/23 C2 regression as recovered for now under ordinary monitoring; reopen as actionable only if a future meaningful-volume window crosses both count and ratio thresholds, or if void-hold samples cluster by trigger.
- Re-eval: Continue ordinary observation. Do not call closure on n<20 windows; reopen recovery watch if c2.verdict_without_pass_count >=3 and >=5%, or c2.void_hold_hint_emitted >=3 and >=5%, in a meaningful-volume window. Track partial sample coverage for void-hold until 2/2+ sampled or no fires occur. at 2026-07-04T03:02:25.273Z

Evidence:
- snapshot:bundle/2026-07-01-eval-a2a-c2-recovery-keep-observe/snapshot
- attribution:bundle/2026-07-01-eval-a2a-c2-recovery-keep-observe/eval-F167-2026-07-01:no-finding
- metric:c1.zombie_hold_count
- metric:c1.hold_cancel_count
- metric:c2.verdict_without_pass_count
- metric:c2.checked
- metric:c2.void_hold_hint_emitted
- metric:c2.void_hold_checked
- metric:inline_action.checked
- metric:line_start.detected
- trace-store:spanCount=217:oldest=1782788635107:newest=1782874800472
- C2/c2.void_hold_hint_emitted/657fefe9a44a1e09
- sampleCoverage:c2.void_hold_hint_emitted=1/2 sampled
- no-finding:Checked components L1,C1,C2,route-serial; all friction values within threshold

Counterarguments:
- The current void-hold point estimate is below floor, but Wilson 95% high is about 8.9%; this is a reporting-rule pass, not proof the true rate is under 5%.
- Only 1 of 2 current void-hold fires has per-fire sample evidence, so one fire cannot be trigger-classified from the artifact alone.
- The 2026-06-29 clean window had only 3 C2 checks and remains low-volume context, not a recovery confirmation point.
- The publisher infra fix is being exercised successfully by daily verdict publication, but that acceptance signal is separate from C2 harness behavior.
