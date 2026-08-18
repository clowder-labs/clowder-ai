---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-08-03-eval-a2a-grounding-retention-recovery-watch
source_snapshot: "snapshot:bundle/2026-08-03-eval-a2a-grounding-retention-recovery-watch/snapshot"
---

# Live Verdict — 2026-08-03-eval-a2a-grounding-retention-recovery-watch

- Verdict: `keep_observe`
- Phenomenon: A2A routing remains clean and the grounding Phase O retention-depth build finding improved: retained grounding samples recovered from 4 to 18 with mismatch still 0. This is recovery-watch day 1, not closure, because the 2026-07-31 build acceptance requires three consecutive daily evals at sample_count >= 10 or an explicit retention/low-volume diagnostic.
- Harness: F167/grounding-phase-o (claim grounding (Phase O shadow))
- Owner ask: No new F167 code action today. Keep daily eval:a2a running; close the 2026-07-31 grounding retention-depth build finding only after two more daily evals also retain grounding sample_count >= 10 with mismatch_sample_count = 0, or after an explicit low-volume/retention diagnostic explains shallow sampling.
- Re-eval: If the 2026-08-04 and 2026-08-05 eval:a2a runs both retain grounding sample_count >= 10 with mismatch_sample_count = 0, or an explicit diagnostic makes any shallow sample interpretable, mark the retention-depth build finding closed; if sample_count drops below 10 without diagnostic or mismatches appear, return to build/fix as appropriate. at 2026-08-04T03:00:00.000Z

Evidence:
- snapshot:bundle/2026-08-03-eval-a2a-grounding-retention-recovery-watch/snapshot
- attribution:bundle/2026-08-03-eval-a2a-grounding-retention-recovery-watch/eval-F167-2026-08-03:no-finding
- metric:grounding.sample_count
- metric:grounding.mismatch_sample_count
- metric:grounding.check_total
- metric:grounding.verdict_total
- metric:c2.verdict_without_pass_count
- metric:c2.checked
- metric:c2.void_hold_hint_emitted
- metric:c2.void_hold_checked
- metric:c1.hold_zombie_count
- metric:counter_window.duration_hours
- metric:legacyScheduledTaskIds
- raw:docs/harness-feedback/snapshots/2026-08-03-eval-F167-runtime.yaml:grounding_sample_evidence
- grounding_sample:hold_ball:issue_id:clowder-labs/clowder-ai#111 issuecomment-5159499092
- grounding_sample:register_pr_tracking:pr_url:clowder-labs/clowder-ai#111

Counterarguments:
- The 7/31 build acceptance required three consecutive healthy daily evals, so one recovered window is insufficient to close the finding.
- C1 hold_zombie_count is 1 in the current window, but attribution suppresses it below the MIN_COUNT=3 finding gate; it is watch-only unless it recurs.
- All retained grounding verdicts are still insufficient rather than verified; this supports retention-depth recovery, not fail-closed grounding confidence.
