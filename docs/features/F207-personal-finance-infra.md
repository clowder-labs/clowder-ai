---
feature_ids: [F207]
related_features: [F188, F193]
topics: [finance, mcp, data-plane, personal-knowledge, read-only]
doc_kind: spec
created: 2026-06-03
---

# F207: AI Family Office — 个人投资学习基建

> **Status**: spec | **Owner**: Ragdoll | **Priority**: P1

## Why

Personal finance work needs a safe learning and analysis substrate before any
cat can reason over market data, fund data, or private notes. The system must
make current facts queryable while keeping the action boundary explicit: finance
data is read-only and must not execute trades, transfers, or account mutations.

F207 owns the finance-data cell referenced by the architecture ownership map:
provider adapters, normalized fact envelopes, source attribution, freshness,
snapshot replay, and the split MCP server that exposes finance facts to cats.

## What

The intended end state is a five-layer personal investment learning foundation:

| Layer | Scope |
|-------|-------|
| Profile | User risk preferences, learning goals, and presentation needs |
| Knowledge | Private finance notes and research collections |
| Data | Read-only provider facts with source, freshness, and confidence metadata |
| Analysis | Cat-authored reasoning over facts and knowledge |
| Decision | Human-owned decision records, never automated order execution |

## Phase B0: Finance Fact Data Plane

The landed infrastructure slice creates a dedicated read-only finance MCP
surface:

- `packages/finance` normalizes provider facts.
- `cat-cafe-finance` is registered as a split MCP server.
- `cat_cafe_finance_query` exposes finance fact queries without exposing raw
  provider credentials or mutation tools.
- Fact responses carry source, `asOf`, confidence, `snapshot_id`, and
  presentation metadata for downstream analysis.

## Acceptance Criteria

- [ ] AC-A1: Finance profile and private knowledge scope are documented before
  analysis workflows rely on them.
- [x] AC-B0.1: `packages/finance` exists as the normalized read-only fact layer.
- [x] AC-B0.2: `cat-cafe-finance` is available as a split MCP server.
- [x] AC-B0.3: finance fact queries expose source/freshness/snapshot metadata.
- [ ] AC-C1: Analysis workflows consume normalized facts and private knowledge
  without bypassing the finance-data cell.
- [ ] AC-D1: Decision records remain human-owned and do not trigger external
  account mutations.

## Boundaries

- Finance provider integrations belong under the finance-data ownership cell.
- Memory retrieves project evidence and private notes; it does not implement
  finance provider adapters.
- Action-plane capabilities must not be added under F207. Any future mutation or
  brokerage integration needs a separate feature and explicit CVO decision.
