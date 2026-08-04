---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-08-04-eval-a2a-grounding-retention-recovery-watch-day2
source_snapshot: "snapshot:bundle/2026-08-04-eval-a2a-grounding-retention-recovery-watch-day2/snapshot"
---

# Live Verdict — 2026-08-04-eval-a2a-grounding-retention-recovery-watch-day2

- Verdict: `keep_observe`
- Phenomenon: A2A routing remains below the attribution finding gate and the grounding Phase O retention-depth recovery held for a second consecutive daily eval: grounding.sample_count is 19 (baseline 18), grounding.mismatch_sample_count is 0, and grounding.check_total/verdict_total are both 29. C2 void-hold hints rose from 3 to 5, but 5/485 remains below the ratio threshold; C1 hold_zombie_count=1 is still watch-only noise below MIN_COUNT=3.
- Harness: F167/grounding-phase-o (claim grounding (Phase O shadow))
- Owner ask: No new F167 code action today. Keep daily eval:a2a running; treat 2026-08-04 as recovery-watch day 2. If the 2026-08-05 eval also has grounding.sample_count >= 10 with grounding.mismatch_sample_count = 0, close the 2026-07-31 grounding retention-depth build finding; if sample_count drops below 10 without diagnostic or mismatches appear, return to build/fix as appropriate.
- Re-eval: Close the 2026-07-31 grounding retention-depth build finding after three consecutive daily eval:a2a runs at grounding.sample_count >= 10 and grounding.mismatch_sample_count = 0 (2026-08-03, 2026-08-04, 2026-08-05), or after an explicit retention/low-volume diagnostic explains shallow sampling. Escalate if any mismatch sample appears or retained sample_count drops below 10 without diagnostic. at 2026-08-05T03:00:00.000Z

Evidence:
- snapshot:bundle/2026-08-04-eval-a2a-grounding-retention-recovery-watch-day2/snapshot
- attribution:bundle/2026-08-04-eval-a2a-grounding-retention-recovery-watch-day2/eval-F167-2026-08-04:no-finding
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
- raw:docs/harness-feedback/snapshots/2026-08-04-eval-F167-runtime.yaml:grounding_sample_evidence
- grounding_sample:register_pr_tracking:pr_url:clowder-labs/clowder-ai#111
- grounding_sample:hold_ball:messageId:unstructured-wait

Counterarguments:
- This is still not closure: the 2026-07-31 build acceptance requires three consecutive healthy daily evals, and today is only the second recovered window.
- All retained grounding verdicts are insufficient rather than verified, so the shadow data does not support fail-closed escalation yet; it only says no recurring mismatch pattern is visible.
- C1 hold_zombie_count remains 1 and C2 void-hold hints increased to 5; both are below finding gates today, but either could become the dominant signal if they recur at higher volume.
