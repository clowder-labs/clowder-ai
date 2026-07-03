---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-07-03-eval-a2a-c2-recovery-keep-observe
source_snapshot: "snapshot:bundle/2026-07-03-eval-a2a-c2-recovery-keep-observe/snapshot"
---

# Live Verdict — 2026-07-03-eval-a2a-c2-recovery-keep-observe

- Verdict: `keep_observe`
- Phenomenon: Current eval:a2a window has no actionable F167 A2A findings in a high-volume sample: C2 verdict-without-pass is 0/248 and C2 void-hold is 3/248 (1.2%), below the 5% reporting floor with a Wilson 95% upper bound around 3.5%. This confirms the 6/17-6/23 C2 regression is recovered under ordinary monitoring, while per-fire sample coverage for void-hold remains incomplete.
- Harness: F167/a2a-harness (A2A chain quality harness (L1/C1/C2/route-serial))
- Owner ask: No code action today. Treat the 6/17-6/23 C2 regression as recovered and keep eval:a2a in ordinary daily monitoring; reopen as actionable only if a future meaningful-volume window crosses both count and ratio thresholds or shows trigger clustering once sample coverage is available.
- Re-eval: Ordinary monitoring: keep reporting daily, but do not keep the 6/17-6/23 C2 regression in active recovery watch unless c2.verdict_without_pass_count >=3 and >=5%, or c2.void_hold_hint_emitted >=3 and >=5%, in a meaningful-volume window. Continue tracking void-hold per-fire sample coverage until it returns to complete coverage or no fires occur. at 2026-07-06T03:01:19.249Z

Evidence:
- snapshot:bundle/2026-07-03-eval-a2a-c2-recovery-keep-observe/snapshot
- attribution:bundle/2026-07-03-eval-a2a-c2-recovery-keep-observe/eval-F167-2026-07-03:no-finding
- metric:c1.zombie_hold_count
- metric:c1.hold_cancel_count
- metric:c2.verdict_without_pass_count
- metric:c2.checked
- metric:c2.void_hold_hint_emitted
- metric:c2.void_hold_checked
- metric:inline_action.checked
- metric:line_start.detected
- metric:inline_action.routed_set_skip
- trace-store:spanCount=884:oldest=1782961389561:newest=1783047600834
- C2/c2.void_hold_hint_emitted/d7e430853150c684
- sampleCoverage:c2.void_hold_hint_emitted=1/3 sampled
- no-finding:Checked components L1,C1,C2,route-serial; all friction values within threshold

Counterarguments:
- Void-hold count reached 3 today, so count-only logic would look noisy; the ratio and Wilson interval keep it below the reporting floor.
- Current void-hold sample coverage is 1/3, so two fires cannot be trigger-classified from the artifact alone.
- There is one route-serial routed_set_skip counter, below threshold but still a background friction signal.
- The 2026-06-29 clean window had only 3 C2 checks and should remain low-volume context, not a recovery confirmation point.
