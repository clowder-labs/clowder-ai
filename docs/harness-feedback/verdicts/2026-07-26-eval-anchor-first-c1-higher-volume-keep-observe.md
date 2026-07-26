---
feature_ids: [F192, F236]
topics: [harness-eval, eval-anchor-first, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:anchor-first
packet_id: 2026-07-26-eval-anchor-first-c1-higher-volume-keep-observe
source_snapshot: "snapshot:bundle/2026-07-26-eval-anchor-first-c1-higher-volume-keep-observe/snapshot"
---

# Live Verdict — 2026-07-26-eval-anchor-first-c1-higher-volume-keep-observe

- Verdict: `keep_observe`
- Phenomenon: The latest visible 24h anchor-first window has materially higher preview and drill traffic than the prior low-sample week, so this cycle can assess a broader mix of preview tools instead of a single sparse path. However, independent blindness evidence is still absent because eval:task-outcome has not published verdict trends and the task-outcome episode store still contains zero written verdicts.
- Harness: F236/anchor-telemetry-rollup (anchor-first preview/drill open-rate rollup)
- Owner ask: Keep F236 in observe mode, use this higher-volume window to confirm per-tool open-rate and net-benefit health, and wait for published eval:task-outcome trends before considering fix or sunset.
- Re-eval: Re-evaluate when the next 24h rollup either shows a per-tool anchor-tax signal with enough volume or eval:task-outcome publishes verdict trends that can confirm or reject blindness. at 2026-08-02T03:00:42.163Z

Sunset Signal Assessment:
- list-tasks: HEALTHY (openRate=0.0%, netBenefit=415)

Open-Rate Detail:
- list-tasks: 0.0% open rate (0/10 items), charsSaved=415, drillChars=0, netBenefit=415
- Orphan drills: 0

Adoption Detail:
- explicitAnchorCalls=0; explicitFullCalls=1; uniqueCatsExplicitAnchor=0
- defaultAnchorCalls=0; defaultFullCalls=0
- legacyEquivalentAnchorCalls=3; legacyEquivalentFullCalls=0
- unknownModeCalls=0

Evidence:
- snapshot:bundle/2026-07-26-eval-anchor-first-c1-higher-volume-keep-observe/snapshot
- attribution:bundle/2026-07-26-eval-anchor-first-c1-higher-volume-keep-observe/AF-2026-07-26-list-tasks
- metric:prometheus:cat_cafe_anchor_returned_count_total{anchor_tool="thread-context"}
- metric:prometheus:cat_cafe_anchor_returned_count_total{anchor_tool="pending-mentions"}
- metric:prometheus:cat_cafe_anchor_returned_count_total{anchor_tool="list-tasks"}
- metric:prometheus:cat_cafe_anchor_full_drill_count_total{anchor_tool="get-message"}
- metric:prometheus:cat_cafe_anchor_full_drill_count_total{anchor_tool="list-tasks"}
- metric:sqlite:task_outcome_episodes.with_verdict=0
- thread:thread_eval_anchor_first/message:0001785034802785-000659-9e62f50c
- task-outcome-episodes.sqlite

Counterarguments:
- The live rollup could still reveal concentrated drilling on a subset of previewed items even though the aggregate Track-1 counts look healthy.
- Zero task-outcome verdicts may mean the blindness detector is missing, not that blindness risk is absent.
- Comparing this week to last week's unusually quiet window may make normal traffic recovery look more meaningful than it is.
