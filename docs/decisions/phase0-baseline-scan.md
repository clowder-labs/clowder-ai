---
feature_ids: []
topics: [architecture, binary-core, phase-0, public-gate, baseline]
doc_kind: decision
created: 2026-04-06
authors: [opus]
status: completed
---

# Phase 0: 禁词扫描基线报告

> 工具：`scripts/check-public-gate.mjs`（`pnpm check:public-gate`）
> 扫描时间：2026-04-06
> 分支：playground

## 基线数据

| 指标 | 值 |
|------|-----|
| 扫描源码文件数 | 1,220 |
| Soft gate 命中文件数 | **61** |
| Soft gate 总命中次数 | **397** |
| Hard gate（npm pack 产物） | **待首次 build 后扫描** |

## Top 10 重灾区文件

| 命中数 | 文件 | 清理 Phase |
|--------|------|-----------|
| 42 | `packages/web/src/components/__tests__/hub-cat-editor.test.tsx` | Phase 3 |
| 37 | `packages/api/src/infrastructure/connectors/adapters/XiaoyiAdapter.ts` | Phase 4（移到 Edition） |
| 30 | `packages/api/src/infrastructure/connectors/connector-gateway-bootstrap.ts` | Phase 4 |
| 22 | `packages/api/src/utils/jiuwenclaw-paths.ts` | Phase 1（移到 Edition） |
| 19 | `packages/api/src/routes/maas-models.ts` | Phase 3 |
| 18 | `scripts/install-auth-config.mjs` | Phase 1（preset 部分移到 Edition） |
| 15 | `packages/api/src/domains/cats/services/agents/providers/relayclaw-sidecar.ts` | Phase 3 |
| 15 | `packages/api/src/integrations/huawei-maas.ts` | Phase 3（移到 Edition） |
| 14 | `packages/api/src/config/model-config-profiles.ts` | Phase 3 |
| 14 | `packages/web/src/components/__tests__/hub-add-member-wizard.test.tsx` | Phase 3 |

## 扫描分级规则

| 级别 | 扫描对象 | 触发行为 |
|------|---------|---------|
| **Hard gate** | npm pack 产物 / bundle manifest / 编译后 JS | PR 阻断 + 发布阻断 |
| **Soft gate** | 源码 `.ts/.tsx/.json`（排除白名单） | warning，追踪趋势 |
| **白名单** | `docs/`, `*.md`, `editions/`, `node_modules/`, `.next/`, `dist/` | 不扫描 |

## 禁词词典

```
OfficeClaw, officeclaw, Huawei, huawei, ModelArts, modelarts,
lightmake.site, jiuwenclaw, maas-details, XiaoYi, xiaoyi,
huawei_maas, HUAWEI_MAAS
```

## 追踪目标

| Phase | 目标 soft gate 命中文件数 | 说明 |
|-------|------------------------|------|
| Phase 0（当前） | 61（基线） | 建立门禁 |
| Phase 1 完成后 | ≤50 | auth + jiuwenclaw + install-auth-config 清理 |
| Phase 3 完成后 | ≤15 | MaaS + 模型 + 前端清理 |
| Phase 4 完成后 | ≤5 | Connector + SkillHub 清理 |
| Phase 5 验收 | **0** | 开源发布前必须清零 |

---

*[宪宪/Opus-46🐾] Phase 0 基线报告*
