---
title: "Upstream Bug Fix Sync — Cat Café → Clowder AI"
created: 2026-04-09
updated: 2026-04-09
author: "[Cat-Cafe-Freelance/Opus-46🐾]"
reviewer: "@codex (砚砚)"
source_branch: "cat-cafe main"
target_branch: "playground"
fork_point: "2026-03-25 (v0.3.0, source commit 4ea75f2c1df0)"
total_candidates: 40
safe_cherry_pick: 34
partial_port: 5
blocked_by_policy: 1
---

# Upstream Bug Fix Sync — Cat Café → Clowder AI

## Background

Clowder AI forked from Cat Café's public repo (`zts212653/clowder-ai`) around March 2026. The last formal sync was **March 25, 2026 (v0.3.0)**. Since then, Cat Café has accumulated **882+ commits on main**, including **~77 bug fix commits** touching `packages/`.

### Scope Decision (CVO-approved)

**IN scope** — bugs in shared infrastructure:
- Invocation / Queue / Session / CLI-spawn (core agent execution pipeline)
- WeChat (weixin) adapter fixes
- Connector / Routing / Config (shared plumbing)
- Redis / Infra
- Web/UI: **only** universal UX bugs — "stuck bubble" (socket orphan, execution bar stuck) and input submission bugs (IME double-submit)

**OUT of scope**:
- ❌ **ACP module** — Clowder AI restructured their ACP (`acp/` → flat `acp-*.ts`), no longer compatible
- ❌ **Feature-specific fixes** (F0xx/F1xx) — Cat Café features, not their concern
- ❌ **Workspace / brake / TTS / Hub memory panel** — they removed all of these
- ❌ **Cat Café brand / opensource-ops** — internal tooling
- ❌ **`intake clowder-ai#xxx`** — those were absorbed FROM their community PRs, they already have the originals
- ❌ **Most UI fixes** — they have heavy independent UI changes; only universal UX bugs apply
- ❌ **New dependencies** — FREELANCE.md red line; commits introducing new deps are `blocked-by-policy`

After filtering: **40 candidates** → **34 safe cherry-pick, 5 partial-port, 1 blocked** (plus 3 test-only in appendix).

### Classification Legend

| Status | Meaning |
|--------|---------|
| `safe-cherry-pick` | Files exist at same paths, commit can be cherry-picked directly (may need minor conflict resolution) |
| `partial-port` | Commit touches both in-scope and out-of-scope files; extract only the relevant hunks manually |
| `blocked-by-policy` | Commit violates FREELANCE.md red lines (new dep, config change, etc.); needs CVO special approval |

## Key Structural Notes

| Area | Same Path? | Notes |
|------|-----------|-------|
| Invocation/Queue/Session | ✅ Yes | Cherry-pick likely works |
| cli-spawn | ✅ Yes | Cherry-pick likely works |
| WeixinAdapter | ✅ Yes | They may have divergent WeChat changes — diff first |
| weixin-cdn | ❌ Missing | Cat Café has `weixin-cdn.ts`, Clowder AI doesn't — check if logic is inlined |
| ConnectorRouter | ✅ Yes | Cherry-pick likely works |
| Routing (route-parallel/serial/helpers) | ✅ Yes | Cherry-pick likely works |
| Config (cat-config-loader, env-registry, etc.) | ✅ Yes | Cherry-pick likely works |
| account-resolver | ❌ Different | Cat Café: `account-resolver.ts` → Clowder AI: `cat-account-binding.ts` |
| useIMEGuard | ❌ Missing | Clowder AI doesn't have this hook — full IME commit can't be cherry-picked |
| scripts/redis-restore-from-rdb.sh | ❌ Missing | Redis restore script doesn't exist in Clowder AI |

---

## Tier 1 — Invocation / Queue / Session / CLI-spawn (12 safe + 2 partial)

> 🟢 Files exist at same paths. Cherry-pick is the primary strategy.

| # | Commit | Description | Key Files | Class | Risk |
|---|--------|-------------|-----------|-------|------|
| 1 | `0caa73556` | stale agent entry zombie defense for InvocationQueue | `InvocationQueue.ts` | safe | 🟢 |
| 2 | `007b1cd9e` | stale processing TTL for InvocationQueue dedup | `InvocationQueue.ts` | safe | 🟢 |
| 3 | `884247e43` | stallAutoKill — fast-fail on idle-silent stall | `invoke-single-cat.ts`, `cli-spawn.ts`, `types.ts` | safe | 🟢 |
| 4 | `d65454042` | skip stallAutoKill during cold-start (no first event yet) | `invoke-single-cat.ts`, `cli-spawn.ts` | safe | 🟢 |
| 5 | `c55d92ffb` | preflight timeout prevents permanent thread blocking | `invoke-single-cat.ts`, `invoke-helpers.ts` | safe | 🟢 |
| 6 | `1a185085d` | reset timeout on progress | `invoke-single-cat.ts` | safe | 🟢 |
| 7 | `8994af631` | increase stallWarningMs for non-anthropic providers | `invoke-single-cat.ts` | safe | 🟢 |
| 8 | `098c717fc` | classify Codex 'no rollout found' as missing_session | `invoke-helpers.ts`, `cli-spawn.ts` | safe | 🟢 |
| 9 | `6e19cf3a3` | retry without session on CLI timeout during resume | `invoke-helpers.ts`, `invoke-single-cat.ts` | safe | 🟡 |
| 10 | `04658d84d` | defer intent_mode broadcast until CLI alive | `QueueProcessor.ts` + providers | safe | 🟡 |
| 11 | `734d94737` | restore multi-cat invocation under shared-state lag | `invoke-single-cat.ts`, `route-helpers/parallel/serial.ts` | safe | 🟡 |
| 12 | `2f94cf90b` | avoid false shared-state hits on diverged runtime branches | `shared-state-preflight.ts` | safe | 🟢 |
| 13 | `ff63c9f1f` | register ALL targetCats + preserve startedAt on F5 recovery | **API**: `InvocationTracker.ts`, `QueueProcessor.ts`, routes; **Web**: `useChatHistory.ts`, `useSocket.ts`, `chatStore.ts` | **partial** | 🟡 |
| 14 | `14daa6c00` | seal audit trail + sealed UX + compress threshold clarity | **API**: `EventAuditLog.ts`, `SessionSealer.ts`; **Web**: `HubStrategyCard.tsx`, `SessionChainPanel.tsx`, `hub-cat-editor-advanced.tsx` (❌ Hub UI) | **partial** | 🟡 |

> **#13 note**: commit also touches `useChatHistory.ts`, `useSocket.ts`, `chatStore.ts` — web hunks need case-by-case review.
> **#14 note**: API-side changes (`EventAuditLog.ts`, `SessionSealer.ts`) are safe; Hub UI files (`HubStrategyCard`, `SessionChainPanel`, `hub-cat-editor-advanced`) must be skipped.

## Tier 2 — WeChat (weixin) Fixes (11 safe + 1 partial + 1 blocked)

> 🟡 WeixinAdapter.ts exists at same path, but they have their own WeChat development. Each fix needs a diff comparison before applying. `weixin-cdn.ts` does NOT exist in Clowder AI.

| # | Commit | Description | Class | Risk |
|---|--------|-------------|-------|------|
| 15 | `3ea2823bd` | aes_key encoding + SILK sampleRate + decodeAesKey compat | **partial** | 🟡 |
| 16 | `7e7c62f40` | voice 1s fake — WAV parser + voice_item metadata | safe | 🟡 |
| 17 | `751b79e41` | remove voice_item metadata that triggers WeChat rejection | safe | 🟡 |
| 18 | `a4e51eaa1` | add bits_per_sample to voice_item — fix 1s fake voice | safe | 🟡 |
| 19 | `356118def` | add playtime-encode voice mode — playtime + encode_type only | safe | 🟡 |
| 20 | `23706000b` | add playtime-sec mode + SILK end-of-stream marker | safe | 🟡 |
| 21 | `91eae538c` | remove 0xFFFF EOS marker that breaks voice playback | safe | 🟡 |
| 22 | `d83ee60a5` | add safety guard for dangerous voice modes | safe | 🟡 |
| 23 | `9f0db93c4` | env-switchable voice_item A/B test — revert hardcoded metadata | safe | 🟡 |
| 24 | `497cdfa8a` | recover DM audio + media_gallery delivery | safe | 🟡 |
| 25 | `2deb9370f` | correct CDN domain — filecdnweixin → novac2c.cdn.weixin.qq.com/c2c | safe | 🟡 |
| 26 | `374a06601` | formalize BUG-5 — context_token is reusable, not single-use | safe | 🟡 |
| 27 | `ea61aa854` | 4 media bugs — aesKey decode, SILK voice, html_widget fallback, URL download | **⛔ blocked** | 🔴 |

> **#27 BLOCKED**: This commit introduces `silk-wasm` as a new dependency (changes `package.json` + `pnpm-lock.yaml`). Per FREELANCE.md red line: "不要引入新依赖". Needs CVO special approval before porting. The non-dep parts (aesKey decode, html_widget fallback, URL download) could be extracted as a `partial-port` if approved.
>
> **#15 note**: This commit touches both `WeixinAdapter.ts` (✅ exists) and `weixin-cdn.ts` (❌ missing in clowder-ai). Port `WeixinAdapter.ts` hunks only; `weixin-cdn.ts` changes and `weixin-cdn.test.js` must be skipped.

## Tier 3 — Connector / Routing / Config (8 fixes)

> 🟢 Most files match. One commit touches route-helpers which is shared infra (not ACP-specific).

| # | Commit | Description | Key Files | Class | Risk |
|---|--------|-------------|-----------|-------|------|
| 28 | `9d149dc8d` | persist parallel error messages as system, not user | `route-parallel.ts`, `ContextAssembler.ts` | safe | 🟢 |
| 29 | `0e1e8e125` | persist error messages for F5 reload | `route-helpers.ts`, `route-serial.ts`, `ContextAssembler.ts` | safe | 🟢 |
| 30 | `5c8425446` | replace cli object on provider switch | `cat-config-loader.ts` | safe | 🟢 |
| 31 | `f2cf0a6fd` | unify connector_message socket protocol to nested format | `ConnectorRouter.ts` | safe | 🟢 |
| 32 | `c9d0a47d9` | add claude-opus-4-6[1m] to builtin Anthropic model list | `provider-profiles.ts` | safe | 🟢 |
| 33 | `7be05a7f7` | preserve model context-window suffix in catalog bootstrap | `cat-catalog-store.ts` | safe | 🟢 |
| 34 | `c800e8b60` | fail-closed single mention + stale auto-exec guard | `InvocationQueue.ts`, `QueueProcessor.ts`, routes | safe | 🟡 |
| 35 | `b9c280505` | incremental context budget deducts system prompt overhead | `route-helpers.ts`, `route-parallel/serial.ts` | safe | 🟢 |

> **#29 note**: commit message says "ACP error messages" but actual files are `route-helpers.ts`, `route-serial.ts`, `ContextAssembler.ts` — all shared routing/context infra, NOT ACP module files. Safe to include.

## Tier 4 — Misc & "Stuck Bubble" UI (3 safe + 2 partial)

| # | Commit | Description | Key Files | Class | Risk |
|---|--------|-------------|-----------|-------|------|
| 36 | `3ae239a1a` | Redis: harden stale AOF detection and restore startup | test scripts; **also** `scripts/redis-restore-from-rdb.sh` (❌ missing in clowder) | **partial** | 🟡 |
| 37 | `2b6e52749` | restore persisted system errors in history | `visibility.ts` | safe | 🟢 |
| 38 | `b0a3fe83e` | socket reconnect reconciliation + done orphan cleanup | `useAgentMessages.ts`, `useSocket.ts` | safe | 🟡 |
| 39 | `c5fa365a9` | remove non-final cat invocation slot on done — stuck execution bar | `useAgentMessages.ts` | safe | 🟡 |
| 40 | `dff38d585` | Chrome IME Enter 误提交 — useIMEGuard 全量修复 | `ChatInput.tsx` + 18 more components incl. `BrakeModal`, workspace, `useIMEGuard.ts` (❌ missing) | **partial** | 🟡 |

> **#36 note**: test files are portable but `scripts/redis-restore-from-rdb.sh` doesn't exist in clowder-ai. Port test changes only, skip script.
> **#40 note**: This commit touches 19 components including `BrakeModal.tsx`, workspace components, and `useIMEGuard.ts` (missing in clowder-ai). **Only the `ChatInput.tsx` hunk is extractable** as a standalone IME fix. Do NOT cherry-pick the full commit.

---

## Excluded — Full List

| Category | Count | Reason |
|----------|-------|--------|
| ACP fixes | 16 | Module completely restructured — incompatible |
| Feature-specific (F0xx/F1xx) | ~60 | Cat Café features, not their concern |
| Workspace / brake / TTS / Hub memory | ~15 | They removed all workspace features |
| Cat Café brand / opensource-ops | ~5 | Internal tooling |
| `intake clowder-ai#xxx` | ~15 | Already in their codebase (absorbed from their PRs) |
| Hub-specific UI (Cat Editor, Sidebar float, etc.) | ~5 | Components they don't have |
| Most Web/UI fixes | ~7 | Heavy independent UI changes; not universal bugs |
| Test-only (no production value) | 5 | Flake fixes, threshold bumps |
| Sync-provenance specific | 1 | Internal sync tooling |

### Test-only commits (port if corresponding production fix is ported)

| Commit | Description |
|--------|-------------|
| `59f4b1e65` | exclude process-liveness-probe from test:public |
| `9db5b6d0e` | exclude env-dependent tests from test:public |
| `1364305af` | bump prompt size thresholds after W8 governance digest growth |
| `4f624d2e2` | isolate legacy project-path allowlist env |
| `b51ff7eeb` | widen liveness probe timer margins to eliminate flake |

---

## Execution Plan

### Phase 1 — Triage ✅ (this document)
- [x] Identify all fix commits since fork point
- [x] Filter by CVO-approved scope (no ACP, no UI except stuck-bubble + IME input bugs)
- [x] Categorize by module and priority
- [x] Check file existence in clowder-ai
- [x] Assess conflict risk per tier
- [x] Review by @codex — v2 P1/P2 findings addressed; v3 consistency fixes applied

### Phase 2 — Safe Cherry-Picks (Tier 1 safe + Tier 3 + Tier 4 safe)
- [ ] Create branch `fix/upstream-invocation-sync` from `playground`
- [ ] Cherry-pick 12 safe Tier 1 + 8 Tier 3 + 3 safe Tier 4 (#37/#38/#39) = 23 total
- [ ] Run tests, fix conflicts
- [ ] PR to `playground`

### Phase 3 — WeChat Fixes (Tier 2 safe)
- [ ] Diff WeixinAdapter.ts between cat-cafe and clowder-ai
- [ ] Investigate weixin-cdn.ts absence — is CDN logic inlined?
- [ ] Cherry-pick 11 safe Tier 2 commits (skip `ea61aa854` unless CVO approves dep)
- [ ] PR to `playground`

### Phase 4 — Partial Ports (requires manual extraction)
- [ ] `3ea2823bd` — extract `WeixinAdapter.ts` hunks only, skip `weixin-cdn.ts` (missing)
- [ ] `14daa6c00` — extract API-only hunks (EventAuditLog, SessionSealer), skip Hub UI
- [ ] `ff63c9f1f` — extract API hunks, review web hunks case-by-case
- [ ] `dff38d585` — extract `ChatInput.tsx` IME fix only (scope: universal input submission bug)
- [ ] `3ae239a1a` — port test changes only, skip missing script
- [ ] PR to `playground`

### Phase 5 — Blocked Items (needs CVO decision)
- [ ] `ea61aa854` — present `silk-wasm` dependency decision to CVO
- [ ] If approved: port with dep; if denied: extract non-dep hunks as partial-port

---

## Red Lines (from FREELANCE.md)

- **No touching `main`** — PR to `playground` only
- **No touching their feature code** — unless task explicitly requires
- **No config files** — `cat-config.json`, `.env`, MCP configs off-limits
- **No Windows packaging** — not our concern
- **No new dependencies** — unless CVO special approval
- **Commit signature**: `[Cat-Cafe-Freelance/模型名🐾]`

---

## Review Log

| Date | Reviewer | Verdict | Action |
|------|----------|---------|--------|
| 2026-04-09 | @codex | Revise — 3×P1 + 2×P2 | v2: P1s fixed (ea61aa854 blocked, dff38d585 partial, 14daa6c00 demoted); P2s fixed (3ae239a1a risk↑, ff63c9f1f files updated) |
| 2026-04-09 | @codex | Revise — 3×P1 + 1×P2 | v3: P1-1 stats corrected (34/5/1); P1-2 Phase 2 now covers Tier 4 safe; P1-3 scope broadened to include IME input bugs; P2 3ea2823bd→partial (weixin-cdn.ts missing) |
| 2026-04-09 | @codex | **Approved** | v3 放行; P3 suggestion: Phase 1 checklist scope wording aligned in v3.1 |
