---
feature_ids: [F192, F236]
topics: [harness-eval, eval-anchor-first, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:anchor-first
packet_id: 2026-08-16-eval-anchor-first-low-drill-keep-observe
source_snapshot: "snapshot:bundle/2026-08-16-eval-anchor-first-low-drill-keep-observe/snapshot"
---

# Live Verdict — 2026-08-16-eval-anchor-first-low-drill-keep-observe

- Verdict: `keep_observe`
- Phenomenon: The latest 24h anchor-first window recovered visible preview traffic on pending-mentions and thread-context, with only two visible get-message drills against that traffic. Task-outcome still has zero post-anchor verdict writebacks, so blindness cannot be tested and no anchor-tax signal is currently evidenced.
- Harness: F236/anchor-telemetry-rollup (anchor-first preview/drill open-rate rollup)
- Owner ask: No action required; keep observing the next scheduled eval, especially whether task-outcome starts writing verdicts and whether list-tasks or get-message preview traffic enters the 24h window.
- Re-eval: Re-evaluate after another 24h window with non-empty preview traffic, or sooner if task-outcome begins emitting verdict writebacks so blindness can be cross-checked. at 2026-08-23T03:00:00.000Z

Sunset Signal Assessment:
- pending-mentions: HEALTHY (openRate=0.0%, netBenefit=14852)
- thread-context: HEALTHY (openRate=6.5%, netBenefit=29372)

Open-Rate Detail:
- pending-mentions: 0.0% open rate (0/15 items), charsSaved=14852, drillChars=0, netBenefit=14852
- thread-context: 6.5% open rate (2/31 items), charsSaved=31986, drillChars=2614, netBenefit=29372
- Orphan drills: 0

Adoption Detail:
- explicitAnchorCalls=0; explicitFullCalls=0; uniqueCatsExplicitAnchor=0
- defaultAnchorCalls=11; defaultFullCalls=0
- legacyEquivalentAnchorCalls=0; legacyEquivalentFullCalls=2
- unknownModeCalls=0

Evidence:
- snapshot:bundle/2026-08-16-eval-anchor-first-low-drill-keep-observe/snapshot
- attribution:bundle/2026-08-16-eval-anchor-first-low-drill-keep-observe/AF-2026-08-16-pending-mentions
- attribution:bundle/2026-08-16-eval-anchor-first-low-drill-keep-observe/AF-2026-08-16-thread-context
- metric:anchor.preview_responses_24h
- metric:anchor.previewed_items_24h
- metric:anchor.drill_events_24h
- metric:task_outcome.verdict_writebacks_since_anchor
- trace:f236-anchor-2026-08-15T10:07Z
- trace:f236-drill-2026-08-15T10:07:56Z
- trace:f236-anchor-2026-08-15T16:51Z

Counterarguments:
- The visible callback log is not the authoritative rollup; the live bundle may still classify fewer joined previews or attribute the two drills to a narrower tool slice.
- A single-day sample can hide intermittent anchor-tax behavior, especially on preview tools that did not appear in this window.
