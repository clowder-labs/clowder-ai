---
feature_ids: [F192, F167]
topics: [harness-eval, eval-a2a, live-verdict]
doc_kind: harness-feedback
feedback_type: live-verdict
domain_id: eval:a2a
packet_id: 2026-07-02-eval-a2a-c2-recovery-keep-observe
source_snapshot: "snapshot:bundle/2026-07-02-eval-a2a-c2-recovery-keep-observe/snapshot"
---

# Live Verdict — 2026-07-02-eval-a2a-c2-recovery-keep-observe

- Verdict: `keep_observe`
- Phenomenon: Current eval:a2a window has no actionable F167 A2A findings: C2 verdict-without-pass is 0/82 and C2 void-hold is 2/82 (2.4%), below both the count threshold and the 5% reporting floor. This is another meaningful-volume clean window after 6/27 and 7/1, so the 6/17-6/23 C2 regression remains recovered under ordinary monitoring, with sample coverage still incomplete for today’s void-hold fires.
- Harness: F167/a2a-harness (A2A chain quality harness (L1/C1/C2/route-serial))
- Owner ask: No code action today. Keep daily eval:a2a in ordinary monitoring; reopen as actionable only if a future meaningful-volume window crosses both count and ratio thresholds, or if void-hold samples cluster by trigger once sample coverage returns.
- Re-eval: Continue ordinary observation. Do not call closure on n<20 windows; reopen recovery watch if c2.verdict_without_pass_count >=3 and >=5%, or c2.void_hold_hint_emitted >=3 and >=5%, in a meaningful-volume window. Also watch whether void-hold per-fire sample coverage recovers from today’s 0/2. at 2026-07-05T03:01:15.658Z

Evidence:
- snapshot:bundle/2026-07-02-eval-a2a-c2-recovery-keep-observe/snapshot
- attribution:bundle/2026-07-02-eval-a2a-c2-recovery-keep-observe/eval-F167-2026-07-02:no-finding
- metric:c1.zombie_hold_count
- metric:c1.hold_cancel_count
- metric:c2.verdict_without_pass_count
- metric:c2.checked
- metric:c2.void_hold_hint_emitted
- metric:c2.void_hold_checked
- metric:inline_action.checked
- metric:line_start.detected
- trace-store:spanCount=26:oldest=1782875127636:newest=1782961200519
- sampleCoverage:c2.void_hold_hint_emitted=0/2 sampled
- no-finding:Checked components L1,C1,C2,route-serial; all friction values within threshold

Counterarguments:
- The current void-hold point estimate is below floor, but Wilson 95% high is about 8.5%; this is a reporting-rule pass, not proof the true rate is under 5%.
- Current trace sample coverage is 0/2 for void-hold fires, so today cannot classify the triggers behind those two counter increments.
- The 2026-06-29 clean window had only 3 C2 checks and remains low-volume context, not a recovery confirmation point.
- The publisher infra fix continues to exercise cleanly through daily publish, but that acceptance signal is separate from C2 harness behavior.
