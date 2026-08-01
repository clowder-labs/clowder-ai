---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-08-01-eval-a2a-grounding-sample-retention-build
source_snapshot: "snapshot:bundle/2026-08-01-eval-a2a-grounding-sample-retention-build/snapshot"
---

# Live Verdict — 2026-08-01-eval-a2a-grounding-sample-retention-build

- Verdict: `build`
- Phenomenon: The 2026-07-31 grounding retention build finding persists and worsened: retained grounding Phase O sample depth fell from 5 to 4, while mismatch remains 0 and A2A routing counters stay clean.
- Harness: F167/grounding-phase-o (claim grounding (Phase O shadow))
- Owner ask: Continue the 2026-07-31 grounding Phase O retention-depth build: raise sample retention capacity or TTL, or emit an explicit low-volume/retention diagnostic, so eval:a2a retains at least 10 grounding samples for 3 consecutive daily runs or explains intentional shallow sampling.
- Re-eval: The build finding closes only after grounding-phase-o keeps mismatch_sample_count at 0 and either retains sample_count >= 10 for 3 consecutive daily evals or reports an explicit low-volume/retention diagnostic that makes shallow sample depth interpretable. at 2026-08-02T03:00:00.000Z

Evidence:
- snapshot:bundle/2026-08-01-eval-a2a-grounding-sample-retention-build/snapshot
- attribution:bundle/2026-08-01-eval-a2a-grounding-sample-retention-build/eval-F167-2026-08-01:no-finding
- metric:grounding.sample_count
- metric:grounding.mismatch_sample_count
- metric:grounding.check_total
- metric:c2.verdict_without_pass_count
- metric:c2.void_hold_hint_emitted
- metric:counter_window.duration_hours
- raw:docs/harness-feedback/snapshots/2026-08-01-eval-F167-runtime.yaml:grounding_sample_evidence
- grounding_sample:register_pr_tracking:pr_url:clowder-labs/clowder-ai#104

Counterarguments:
- The routing guard itself continues to improve: C2 forced-pass is 0/306 and void-hold stayed frozen at 3/308 (0.97%).
- The grounding checker may simply have low eligible stateful-tool traffic, and no mismatches were retained.
- The raw attribution report correctly has no friction finding because this remains a longitudinal evidence-depth gap rather than a threshold breach in frictionCounts.
