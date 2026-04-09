---
feature_ids: []
topics: [architecture, binary-core, phase-0, sqlite, state-ownership]
doc_kind: decision
created: 2026-04-06
authors: [opus]
status: completed
---

# Phase 0: SQLite Schema 归属审计

> 依据 binary-core-product-line-v3.md §4.6 State Ownership Contract 要求。

## 审计结论

**SQLite 中无 vendor 特定字段。** 所有表结构为通用设计，不含 Huawei/OfficeClaw/ModelArts 等商业信息。Pack isolation 通过 `pack_id` 实现，属于 Edition 治理范畴但不构成 vendor 泄漏风险。

## 表级归属

| 表名 | Owner | 说明 |
|------|-------|------|
| `evidence_docs` | **Core** | 通用 evidence 存储（anchor/kind/title/summary/keywords），V6 增加 `pack_id` 隔离 |
| `evidence_fts` | **Core** | FTS5 虚拟表，基于 evidence_docs 的全文搜索 |
| `edges` | **Core** | 通用图关系（from_anchor → to_anchor + relation） |
| `markers` | **Core** | 通用标注系统（content/source/status/target_kind） |
| `evidence_passages` | **Core** | 消息级粒度（doc_anchor/passage_id/content/speaker/position） |
| `summary_segments` | **Core** | Thread 级摘要（topic tracking） |
| `summary_state` | **Core** | 摘要状态管理 |
| `task_run_ledger` | **Core** | 任务执行历史（task_id/outcome/duration_ms/assigned_cat_id） |
| `dynamic_task_defs` | **Edition（Pack 治理）** | 用户可配置任务定义（pack-scoped，trigger/params/delivery） |
| `pack_template_defs` | **Edition（Pack 治理）** | Pack 级模板治理（template_id/pack_id/category/schema） |
| `scheduler_global_control` | **Edition（Pack 治理）** | 调度器全局控制 |
| `scheduler_task_overrides` | **Edition（Pack 治理）** | 任务级调度覆盖 |
| `scheduler_emissions` | **Edition（Pack 治理）** | 调度器发射记录（Pack 感知抑制） |

## 决策

1. **Core SQLite**（`evidence_docs` 到 `task_run_ledger`）：Core 独占，Edition 禁止写入
2. **Pack 治理表**（`dynamic_task_defs` 到 `scheduler_emissions`）：通过 `pack_id` 隔离，Schema 归 Core 管理，数据归 Edition/Pack 治理
3. **Edition 自有 SQLite**：若 Edition plugin 需要本地持久化，必须自管独立 .db 文件，不得在 Core SQLite 中加表

## 风险

- `pack_id` 字段本身是 Core schema 的一部分，但 pack 的定义和生命周期归 Edition 管理。升级时需确保 pack-scoped 数据的迁移由 Edition 负责。

---

*[宪宪/Opus-46🐾] Phase 0 SQLite 审计*
