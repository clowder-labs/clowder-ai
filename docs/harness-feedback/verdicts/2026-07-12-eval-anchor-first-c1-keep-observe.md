---
feature_ids: [F192, F236]
topics: [harness-eval, eval-anchor-first, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:anchor-first
packet_id: 2026-07-12-eval-anchor-first-c1-keep-observe
source_snapshot: "snapshot:bundle/2026-07-12-eval-anchor-first-c1-keep-observe/snapshot"
---

# Live Verdict — 2026-07-12-eval-anchor-first-c1-keep-observe

- Verdict: `keep_observe`
- Phenomenon: The latest 24h anchor-first window appears low-volume and concentrated in thread-context preview traffic, while independent blindness evidence is absent because eval:task-outcome has not yet produced published verdict trends. Current evidence is enough to watch adoption and open-rate detail, but not enough to justify sunset or a corrective fix.
- Harness: F236/anchor-telemetry-rollup (anchor-first preview/drill open-rate rollup)
- Owner ask: Keep F236 in observe mode, gather another full 24h anchor-telemetry window, and wait for eval:task-outcome trend evidence before considering fix or sunset.
- Re-eval: Re-evaluate when the next 24h rollup either shows a tool with enough preview volume to assess sunset signals confidently or eval:task-outcome publishes trend evidence that can confirm or reject blindness. at 2026-07-19T03:15:21.102Z

Sunset Signal Assessment:
- thread-context: HEALTHY (openRate=0.9%, netBenefit=279197)

Open-Rate Detail:
- thread-context: 0.9% open rate (1/110 items), charsSaved=280650, drillChars=1453, netBenefit=279197
- Orphan drills: 0

Adoption Detail:
- explicitAnchorCalls=2; explicitFullCalls=3; uniqueCatsExplicitAnchor=1
- defaultAnchorCalls=14; defaultFullCalls=0
- legacyEquivalentAnchorCalls=0; legacyEquivalentFullCalls=1
- unknownModeCalls=0

Evidence:
- snapshot:bundle/2026-07-12-eval-anchor-first-c1-keep-observe/snapshot
- attribution:bundle/2026-07-12-eval-anchor-first-c1-keep-observe/AF-2026-07-12-thread-context
- metric:prometheus:cat_cafe_anchor_returned_count_total{anchor_tool="thread-context"}
- metric:prometheus:cat_cafe_anchor_full_drill_count_total{anchor_tool="get-message"}
- metric:sqlite:task_outcome_episodes.with_verdict=0
- data/transcripts/threads/thread_eval_anchor_first/gpt52/sessions/bb6104ac-0a88-4f75-81cd-b14e856c39db/events.live.jsonl
- task-outcome-episodes.sqlite

Counterarguments:
- The live rollup could still show a high open-rate or negative net benefit on a low-visibility tool even though Track-1 counters look healthy at the aggregate level.
- Because task-outcome evidence is currently missing, this verdict may be underreacting to a real but unmeasured blindness effect.
- If the current process lifetime is materially shorter than 24h, the window may under-sample adoption and make the rollout look healthier than it is.
