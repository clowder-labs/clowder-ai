---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-06-27-eval-a2a-clean-keep-observe
source_snapshot: "snapshot:bundle/2026-06-27-eval-a2a-clean-keep-observe/snapshot"
---

# Live Verdict — 2026-06-27-eval-a2a-clean-keep-observe

- Verdict: `keep_observe`
- Phenomenon: Current eval:a2a window is clean across F167 A2A harness components: C2 verdict-without-pass is 0/210, C2 void-hold is 1/216, and route-serial inline hinting is 1/216. The prior 2026-06-23 raw regression (C2 verdict-without-pass 13/84) is not present in today's 23.96h window.
- Harness: F167/a2a-harness (A2A chain quality harness (L1/C1/C2/route-serial))
- Owner ask: No immediate code action. Keep the daily eval:a2a schedule active and watch the next 72h for recurrence of C2 verdict-without-pass or C1 zombie-hold above threshold.
- Re-eval: Next eval remains below threshold: c2.verdict_without_pass_count < 3 or <5%, c2.void_hold_hint_emitted <3 or <5%, and c1.zombie_hold_count does not repeat above threshold. at 2026-06-30T03:03:40.908Z

Evidence:
- snapshot:bundle/2026-06-27-eval-a2a-clean-keep-observe/snapshot
- attribution:bundle/2026-06-27-eval-a2a-clean-keep-observe/eval-F167-2026-06-27:no-finding
- metric:c1.zombie_hold_count
- metric:c1.hold_cancel_count
- metric:c2.verdict_without_pass_count
- metric:c2.checked
- metric:c2.void_hold_hint_emitted
- metric:c2.void_hold_checked
- metric:inline_action.shadow_miss
- metric:inline_action.hint_emitted
- metric:inline_action.checked
- trace-store:spanCount=1053:oldest=1782443055946:newest=1782529323956
- C1/c1.zombie_hold_count/3f3d2e619454f32f
- no-finding:Checked components L1,C1,C2,route-serial; all friction values within threshold

Counterarguments:
- The single C1 zombie-hold sample means the window is clean by threshold, not perfectly empty.
- The 2026-06-23 raw regression showed a real C2 spike; one clean day is not enough to delete or sunset the harness.
- Legacy scheduled task IDs are empty in eval-a2a.yaml, so duplicate legacy scheduling is not a plausible cause of today's telemetry.
