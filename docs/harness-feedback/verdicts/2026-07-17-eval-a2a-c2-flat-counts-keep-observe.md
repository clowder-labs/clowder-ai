---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-07-17-eval-a2a-c2-flat-counts-keep-observe
source_snapshot: "snapshot:bundle/2026-07-17-eval-a2a-c2-flat-counts-keep-observe/snapshot"
---

# Live Verdict — 2026-07-17-eval-a2a-c2-flat-counts-keep-observe

- Verdict: `keep_observe`
- Phenomenon: Current 23.94h eval:a2a trace window has no actionable F167 A2A findings. C2 forced-pass and void-hold absolute counts remained flat for another 24h while denominators grew, C1 zombie stayed at one historical event, and grounding shadow telemetry still has zero mismatch samples.
- Harness: F167/f167-runtime-eval (F167 A2A runtime eval telemetry)
- Owner ask: No code action today. Keep daily eval:a2a active; continue watching whether C2 forced-pass or void-hold crosses both count >=3 and ratio >=5%, whether C1 zombie increments again, or whether grounding mismatch_sample_count becomes nonzero.
- Re-eval: Next eval remains below the C2 5% ratio floor with no new C1 zombie increment and grounding mismatch_sample_count remains 0. at 2026-07-18T03:00:00.000Z

Evidence:
- snapshot:bundle/2026-07-17-eval-a2a-c2-flat-counts-keep-observe/snapshot
- attribution:bundle/2026-07-17-eval-a2a-c2-flat-counts-keep-observe/eval-F167-2026-07-17:no-finding
- metric:c2.verdict_without_pass_count
- metric:c2.checked
- metric:c2.void_hold_hint_emitted
- metric:c2.void_hold_checked
- metric:c1.hold_zombie_count
- metric:grounding.check_total
- metric:grounding.verdict_total
- metric:grounding.mismatch_sample_count
- metadata:eval-F167-2026-07-17:no-finding

Counterarguments:
- Because C2 counters are cumulative over process lifetime, day-over-day flat absolute counts are the key signal; a process restart would make direct absolute-count comparison invalid.
- Route-serial inline hint counters remain nonzero, but their ratio is also below threshold and attribution reported no actionable finding.
- Grounding verdicts are insufficient, not verified; this supports keep_observe rather than promotion to fail-closed.
