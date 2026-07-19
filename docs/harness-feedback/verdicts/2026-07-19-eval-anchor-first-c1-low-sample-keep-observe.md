---
feature_ids: [F192, F236]
topics: [harness-eval, eval-anchor-first, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:anchor-first
packet_id: 2026-07-19-eval-anchor-first-c1-low-sample-keep-observe
source_snapshot: "snapshot:bundle/2026-07-19-eval-anchor-first-c1-low-sample-keep-observe/snapshot"
---

# Live Verdict — 2026-07-19-eval-anchor-first-c1-low-sample-keep-observe

- Verdict: `keep_observe`
- Phenomenon: The latest visible 24h anchor-first activity is far below last week's window and shows only sparse preview traffic, so this cycle is primarily a low-sample observation pass rather than a meaningful sunset decision point. Independent blindness evidence is still absent because eval:task-outcome has not published verdict trends and the task-outcome episode store still has zero written verdicts.
- Harness: F236/anchor-telemetry-rollup (anchor-first preview/drill open-rate rollup)
- Owner ask: Keep F236 in observe mode and gather another 24h anchor-telemetry window with more preview volume or a published eval:task-outcome trend before considering fix or sunset.
- Re-eval: Re-evaluate when a fresh 24h rollup has enough previewed items per tool to assess sunset signals confidently or when eval:task-outcome publishes verdict trends that can confirm or reject blindness. at 2026-07-26T03:00:56.728Z

Sunset Signal Assessment:
- pending-mentions: LOW_SAMPLE (openRate=0.0%, netBenefit=0)
- thread-context: HEALTHY (openRate=0.0%, netBenefit=7009)

Open-Rate Detail:
- pending-mentions: 0.0% open rate (0/0 items), charsSaved=0, drillChars=0, netBenefit=0
- thread-context: 0.0% open rate (0/10 items), charsSaved=7009, drillChars=0, netBenefit=7009
- Orphan drills: 0

Adoption Detail:
- explicitAnchorCalls=0; explicitFullCalls=0; uniqueCatsExplicitAnchor=0
- defaultAnchorCalls=2; defaultFullCalls=0
- legacyEquivalentAnchorCalls=0; legacyEquivalentFullCalls=0
- unknownModeCalls=0

Evidence:
- snapshot:bundle/2026-07-19-eval-anchor-first-c1-low-sample-keep-observe/snapshot
- attribution:bundle/2026-07-19-eval-anchor-first-c1-low-sample-keep-observe/AF-2026-07-19-thread-context
- metric:prometheus:cat_cafe_anchor_returned_count_total{anchor_tool="pending-mentions"}
- metric:prometheus:cat_cafe_anchor_returned_count_total{anchor_tool="thread-context"}
- metric:sqlite:task_outcome_episodes.with_verdict=0
- thread:thread_eval_anchor_first/message:0001784430000252-000111-00306bac
- task-outcome-episodes.sqlite

Counterarguments:
- The live rollup could still uncover a concentrated drill pattern on a tool that is invisible in the sparse Track-1 aggregate sample.
- A low-volume week can mask a real preview-quality problem because dissatisfied cats may avoid the tool entirely rather than drilling through it.
- Using last week's 24h window as the baseline may overstate regression if workload mix changed materially this week.
