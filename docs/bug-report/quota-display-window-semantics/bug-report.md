# 配额百分比口径与 Codex 窗口标签失真

## 报告人

co-creator Sean 于 2026-07-18 在 runtime 额度看板验收时发现。

## Bug 诊断胶囊

| 栏位 | 内容 |
|------|------|
| **1. 现象** | 同一看板有的额度显示“已用”、有的显示“剩余”；Codex 当前账号显示“5小时使用限额”，但实际重置窗口疑似已改为一周。 |
| **2. 证据** | runtime `GET /api/quota` 返回 `usedPercent=27, percentKind=used`；Wham 原始响应随后返回 `used_percent=28, limit_window_seconds=604800, secondary_window=null`。604800 秒等于 7 天。 |
| **3. 根因** | Web 直接按上游 `percentKind` 选择“已用/剩余”文案，未统一展示口径；API 又把 `primary_window` 永久写死为“5小时使用限额”，忽略了窗口实际时长。 |
| **4. 诊断策略** | 对照 Web 百分比格式化函数、Wham 原始非敏感字段、API parser 和 OpenAI 当前官方 pricing/rate-limit 文档。 |
| **5. 超时策略** | 若官方文档未枚举具体重置窗口，以账号实时 Wham `limit_window_seconds` 为运行时真相源，不把套餐营销文案推断成接口契约。 |
| **6. 预警策略** | 若实现继续依据 `primary/secondary` 字段名推断小时/周窗口，停止字符串修补，改为基于窗口秒数生成标签。 |
| **7. 用户可见交互修正** | 所有额度统一显示“X% 剩余”；Codex 按接口窗口秒数展示“每周使用限额”等真实周期。 |
| **8. 验收** | 27% 已用渲染为 73% 剩余；604800 秒的 Codex primary window 渲染为“每周使用限额”；定向 API/Web 测试、类型检查和生产构建通过。 |

## 修复方案

Web 展示层把任意上游口径转换为剩余百分比；风险计算继续使用利用率。Codex parser 优先采用服务端标签，否则根据 `limit_window_seconds` 生成周期标签；仅当旧响应没有窗口时长时才沿用旧标签，避免凭字段名臆测新周期。

## 验证方式

先新增两个回归测试并确认分别因“27% 已用”和“5小时使用限额”失败；实现后重跑 API/Web 配额测试、类型检查和构建。
