---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-06-29-eval-a2a-low-volume-clean-keep-observe
source_snapshot: "snapshot:bundle/2026-06-29-eval-a2a-low-volume-clean-keep-observe/snapshot"
---

# Live Verdict — 2026-06-29-eval-a2a-low-volume-clean-keep-observe

- Verdict: `keep_observe`
- Phenomenon: Current eval:a2a window has no actionable F167 A2A findings: C2 verdict-without-pass is 0/3, C2 void-hold is 0/3, C1 zombie-hold is 0, and route-serial reports no inline-action friction. This continues the recovery seen on 2026-06-27, but today's C2 denominator is only 3 checks after the service restart window.
- Harness: F167/a2a-harness (A2A chain quality harness (L1/C1/C2/route-serial))
- Owner ask: No code action today. Keep the daily eval:a2a schedule active and require the next window to have either sufficient C2 volume or another clean low-volume observation before treating the C2 regression as closed.
- Re-eval: Next eval remains below threshold: c2.verdict_without_pass_count <3 or <5%, c2.void_hold_hint_emitted <3 or <5%, and either c2.checked >=10 or the packet explicitly records low-volume confidence. at 2026-07-02T03:01:39.026Z

Evidence:
- snapshot:bundle/2026-06-29-eval-a2a-low-volume-clean-keep-observe/snapshot
- attribution:bundle/2026-06-29-eval-a2a-low-volume-clean-keep-observe/eval-F167-2026-06-29:no-finding
- metric:c1.zombie_hold_count
- metric:c1.hold_cancel_count
- metric:c2.verdict_without_pass_count
- metric:c2.checked
- metric:c2.void_hold_hint_emitted
- metric:c2.void_hold_checked
- metric:inline_action.checked
- trace-store:spanCount=362:oldest=1782621958042:newest=1782702000065
- low-denominator:c2.checked=3:c2.void_hold_checked=3:inline_action.checked=3
- no-finding:Checked components L1,C1,C2,route-serial; all friction values within threshold

Counterarguments:
- C2 checked only 3 turns in the current window, so zero findings is weaker evidence than the 2026-06-27 high-volume clean window.
- The service restarted during the longitudinal sequence, which may reduce comparable volume and hide rare routing failures.
- Legacy scheduled task IDs are empty in eval-a2a.yaml, so duplicate legacy scheduling is not a plausible explanation for low volume or clean results.
