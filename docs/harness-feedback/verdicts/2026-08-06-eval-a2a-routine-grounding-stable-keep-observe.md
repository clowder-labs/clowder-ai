---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-08-06-eval-a2a-routine-grounding-stable-keep-observe
source_snapshot: "snapshot:bundle/2026-08-06-eval-a2a-routine-grounding-stable-keep-observe/snapshot"
---

# Live Verdict — 2026-08-06-eval-a2a-routine-grounding-stable-keep-observe

- Verdict: `keep_observe`
- Phenomenon: After the 2026-08-05 closure of the grounding retention-depth build finding, today's eval:a2a window remains healthy: grounding.sample_count rose from 19 to 21, grounding.mismatch_sample_count remains 0, and attribution finding_count remains 0. C1 hold_zombie_count stays at 1 and C2 void-hold hints stay at 5/535, both below finding gates; grounding verdicts remain insufficient, so this is routine observe rather than fail-closed readiness.
- Harness: F167/grounding-phase-o (claim grounding (Phase O shadow))
- Owner ask: No new F167 code action. Keep routine daily eval:a2a active after the 2026-08-05 closure. Reopen or escalate only if grounding.sample_count drops below 10 without diagnostic, grounding.mismatch_sample_count exceeds 0, grounding budget exhaustion appears, or C1/C2 attribution findings recur above gates.
- Re-eval: Routine keep-observe continues while grounding.sample_count remains >= 10, grounding.mismatch_sample_count remains 0, attribution finding_count remains 0, and C1/C2 watch metrics stay below their finding gates. Escalate to build/fix if any of those conditions fails. at 2026-08-07T03:00:00.000Z

Evidence:
- snapshot:bundle/2026-08-06-eval-a2a-routine-grounding-stable-keep-observe/snapshot
- attribution:bundle/2026-08-06-eval-a2a-routine-grounding-stable-keep-observe/eval-F167-2026-08-06:no-finding
- metric:grounding.sample_count
- metric:grounding.mismatch_sample_count
- metric:grounding.check_total
- metric:grounding.verdict_total
- metric:grounding.budget_exhausted_total
- metric:c2.verdict_without_pass_count
- metric:c2.checked
- metric:c2.void_hold_hint_emitted
- metric:c2.void_hold_checked
- metric:c1.hold_zombie_count
- metric:inline_action.shadow_miss
- metric:counter_window.duration_hours
- metric:legacyScheduledTaskIds
- raw:docs/harness-feedback/snapshots/2026-08-06-eval-F167-runtime.yaml:grounding_sample_evidence
- grounding_sample:register_pr_tracking:pr_url:clowder-labs/clowder-ai#115
- grounding_sample:hold_ball:messageId:unstructured-wait

Counterarguments:
- This is not fail-closed readiness: grounding verdicts are retained but still insufficient rather than verified.
- A no-finding attribution packet can hide low-frequency noise; C1 hold_zombie_count and inline_action.shadow_miss are still nonzero at 1 each.
- The counter window is long and healthy, but process-level counters still reflect runtime traffic mix rather than normalized workload quality.
