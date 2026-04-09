---
title: "Upstream Bug Fix Sync — Cat Café → Clowder AI"
created: 2026-04-09
author: "[Cat-Cafe-Freelance/Opus-46🐾]"
source_branch: "cat-cafe main"
target_branch: "playground"
fork_point: "2026-03-25 (v0.3.0, source commit 4ea75f2c1df0)"
total_candidates: 40
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
- Web/UI: **only** "stuck bubble" type bugs (socket orphan, IME, execution bar stuck)

**OUT of scope**:
- ❌ **ACP module** — Clowder AI restructured their ACP (`acp/` → flat `acp-*.ts`), no longer compatible
- ❌ **Feature-specific fixes** (F0xx/F1xx) — Cat Café features, not their concern
- ❌ **Workspace / brake / TTS / Hub memory panel** — they removed all of these
- ❌ **Cat Café brand / opensource-ops** — internal tooling
- ❌ **`intake clowder-ai#xxx`** — those were absorbed FROM their community PRs, they already have the originals
- ❌ **Most UI fixes** — they have heavy independent UI changes; only universal UX bugs apply

After filtering: **40 applicable bug fixes** in 4 tiers.

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

---

## Tier 1 — Invocation / Queue / Session / CLI-spawn (14 fixes)

> 🟢 Files exist at same paths. Cherry-pick is the primary strategy. Verify after each batch.

| # | Commit | Description | Key Files | Risk |
|---|--------|-------------|-----------|------|
| 1 | `0caa73556` | stale agent entry zombie defense for InvocationQueue | `InvocationQueue.ts` | 🟢 |
| 2 | `007b1cd9e` | stale processing TTL for InvocationQueue dedup | `InvocationQueue.ts` | 🟢 |
| 3 | `884247e43` | stallAutoKill — fast-fail on idle-silent stall | `invoke-single-cat.ts`, `cli-spawn.ts`, `types.ts` | 🟢 |
| 4 | `d65454042` | skip stallAutoKill during cold-start (no first event yet) | `invoke-single-cat.ts`, `cli-spawn.ts` | 🟢 |
| 5 | `c55d92ffb` | preflight timeout prevents permanent thread blocking | `invoke-single-cat.ts`, `invoke-helpers.ts` | 🟢 |
| 6 | `1a185085d` | reset timeout on progress | `invoke-single-cat.ts` | 🟢 |
| 7 | `8994af631` | increase stallWarningMs for non-anthropic providers | `invoke-single-cat.ts` | 🟢 |
| 8 | `098c717fc` | classify Codex 'no rollout found' as missing_session | `invoke-helpers.ts`, `cli-spawn.ts` | 🟢 |
| 9 | `6e19cf3a3` | retry without session on CLI timeout during resume | `invoke-helpers.ts`, `invoke-single-cat.ts` | 🟡 |
| 10 | `04658d84d` | defer intent_mode broadcast until CLI alive | `QueueProcessor.ts` + providers | 🟡 |
| 11 | `ff63c9f1f` | register ALL targetCats + preserve startedAt on F5 recovery | `InvocationTracker.ts`, `QueueProcessor.ts` | 🟡 |
| 12 | `14daa6c00` | seal audit trail + sealed UX + compress threshold clarity | `EventAuditLog.ts`, `SessionSealer.ts` | 🟡 |
| 13 | `734d94737` | restore multi-cat invocation under shared-state lag | `invoke-single-cat.ts`, `route-helpers/parallel/serial.ts` | 🟡 |
| 14 | `2f94cf90b` | avoid false shared-state hits on diverged runtime branches | `shared-state-preflight.ts` | 🟢 |

## Tier 2 — WeChat (weixin) Fixes (13 fixes)

> 🟡 WeixinAdapter.ts exists at same path, but they have their own WeChat development. Each fix needs a diff comparison before applying. `weixin-cdn.ts` does NOT exist in Clowder AI — CDN-related fixes need investigation.

| # | Commit | Description | Risk |
|---|--------|-------------|------|
| 15 | `ea61aa854` | 4 media bugs — aesKey decode, SILK voice, html_widget fallback, URL download | 🟡 |
| 16 | `3ea2823bd` | aes_key encoding + SILK sampleRate + decodeAesKey compat | 🟡 |
| 17 | `7e7c62f40` | voice 1s fake — WAV parser + voice_item metadata | 🟡 |
| 18 | `751b79e41` | remove voice_item metadata that triggers WeChat rejection | 🟡 |
| 19 | `a4e51eaa1` | add bits_per_sample to voice_item — fix 1s fake voice | 🟡 |
| 20 | `356118def` | add playtime-encode voice mode — playtime + encode_type only | 🟡 |
| 21 | `23706000b` | add playtime-sec mode + SILK end-of-stream marker | 🟡 |
| 22 | `91eae538c` | remove 0xFFFF EOS marker that breaks voice playback | 🟡 |
| 23 | `d83ee60a5` | add safety guard for dangerous voice modes | 🟡 |
| 24 | `9f0db93c4` | env-switchable voice_item A/B test — revert hardcoded metadata | 🟡 |
| 25 | `497cdfa8a` | recover DM audio + media_gallery delivery | 🟡 |
| 26 | `2deb9370f` | correct CDN domain — filecdnweixin → novac2c.cdn.weixin.qq.com/c2c | 🟡 |
| 27 | `374a06601` | formalize BUG-5 — context_token is reusable, not single-use | 🟡 |

## Tier 3 — Connector / Routing / Config (8 fixes)

> 🟢 Most files match. `account-resolver.ts` is renamed — that fix needs adaptation.

| # | Commit | Description | Key Files | Risk |
|---|--------|-------------|-----------|------|
| 28 | `9d149dc8d` | persist parallel error messages as system, not user | `route-parallel.ts`, `ContextAssembler.ts` | 🟢 |
| 29 | `0e1e8e125` | persist ACP error messages for F5 reload | `route-helpers.ts`, `route-serial.ts`, `ContextAssembler.ts` | 🟢 |
| 30 | `5c8425446` | replace cli object on provider switch | `cat-config-loader.ts` | 🟢 |
| 31 | `f2cf0a6fd` | unify connector_message socket protocol to nested format | `ConnectorRouter.ts` | 🟢 |
| 32 | `c9d0a47d9` | add claude-opus-4-6[1m] to builtin Anthropic model list | `provider-profiles.ts` | 🟢 |
| 33 | `7be05a7f7` | preserve model context-window suffix in catalog bootstrap | `cat-catalog-store.ts` | 🟢 |
| 34 | `c800e8b60` | fail-closed single mention + stale auto-exec guard | `InvocationQueue.ts`, `QueueProcessor.ts`, routes | 🟡 |
| 35 | `b9c280505` | incremental context budget deducts system prompt overhead | `route-helpers.ts`, `route-parallel/serial.ts` | 🟢 |

## Tier 4 — Misc & "Stuck Bubble" UI (5 fixes)

> Mixed bag. Web fixes are only the universal UX bugs (socket orphan, IME, execution bar stuck).

| # | Commit | Description | Key Files | Risk |
|---|--------|-------------|-----------|------|
| 36 | `3ae239a1a` | Redis: harden stale AOF detection and restore startup | test scripts | 🟢 |
| 37 | `2b6e52749` | restore persisted system errors in history | `visibility.ts` | 🟢 |
| 38 | `b0a3fe83e` | socket reconnect reconciliation + done orphan cleanup | `useAgentMessages.ts`, `useSocket.ts` | 🟡 |
| 39 | `dff38d585` | Chrome IME Enter 误提交 — useIMEGuard 全量修复 | `ChatInput.tsx` + 18 more components | 🟡 |
| 40 | `c5fa365a9` | remove non-final cat invocation slot on done — stuck execution bar | `useAgentMessages.ts` | 🟡 |

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
- [x] Filter by CVO-approved scope (no ACP, no UI except stuck-bubble)
- [x] Categorize by module and priority
- [x] Check file existence in clowder-ai
- [x] Assess conflict risk per tier

### Phase 2 — Invocation/Queue + Config (Tier 1 + Tier 3)
- [ ] Create branch `fix/upstream-invocation-sync` from `playground`
- [ ] Cherry-pick Tier 1 commits (14 invocation/queue fixes) — files match
- [ ] Cherry-pick Tier 3 commits (8 config/routing fixes) — mostly safe
- [ ] Run tests, fix conflicts
- [ ] PR to `playground`

### Phase 3 — WeChat Fixes (Tier 2)
- [ ] Diff WeixinAdapter.ts between cat-cafe and clowder-ai
- [ ] Investigate weixin-cdn.ts absence — is CDN logic inlined?
- [ ] Determine which 13 fixes are applicable vs already fixed vs conflicting
- [ ] Create branch `fix/upstream-weixin-sync`
- [ ] Apply fixes (manual merge where needed)
- [ ] PR to `playground`

### Phase 4 — Stuck-Bubble UI + Misc (Tier 4)
- [ ] Diff affected web hooks (useAgentMessages, useSocket, ChatInput)
- [ ] Apply 5 fixes where component logic matches
- [ ] Create branch `fix/upstream-ui-misc-sync`
- [ ] PR to `playground`

---

## Red Lines (from FREELANCE.md)

- **No touching `main`** — PR to `playground` only
- **No touching their feature code** — unless task explicitly requires
- **No config files** — `cat-config.json`, `.env`, MCP configs off-limits
- **No Windows packaging** — not our concern
- **No new dependencies**
- **Commit signature**: `[Cat-Cafe-Freelance/模型名🐾]`
