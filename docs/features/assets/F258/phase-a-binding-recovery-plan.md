---
feature_ids: [F258]
related_features: [F126, F190]
topics: [bluetooth, ble, binding, recovery, settings, testing]
doc_kind: plan
created: 2026-07-18
---

# F258 Phase A 绑定恢复实施计划

## 问题与目标

真实设备验收确认：Android 外设停止并重新广播后，macOS 可能为同一物理设备返回新的
CoreBluetooth 标识。现有绑定永久保存首次扫描得到的 `platformDeviceId`，后续读取只尝试旧标识，
因此节点仍显示 `online`，实际调用却持续超时。

本切片交付两项能力：

1. operator 可以在「设备与 Limb」中测试单个绑定当前是否可连接。
2. 标识失效时，operator 可以把当前扫描结果显式重新关联到原绑定，同时保留
   `bindingId`、`nodeId` 和既有审计关联。

## 安全决策

- 不按设备名称、RSSI、广播地址或服务 UUID 静默匹配。它们都不能证明设备身份。
- 重新关联必须来自当前 30 秒扫描会话中的不透明 `discoveryId`，并由 operator 二次确认。
- 新设备必须通过 GATT 检查，且 adapter 与命令集合必须和原绑定完全一致。
- API 与 UI 不返回 `platformDeviceId`；扫描结束后继续清空未绑定发现结果。
- 重新关联不删除绑定，不生成新的节点 ID；持久记录仍为 TTL 0。
- 状态测试只执行只读 GATT 检查，不开放任意 GATT 读写入口。
- helper 完成协议握手后，客户端必须等待 CoreBluetooth 明确报告 `poweredOn` 再发送首个操作请求；不使用盲目重试掩盖初始化竞态。

## Console 状态矩阵

| 状态 | 已绑定设备卡片 | 附近设备区 |
|---|---|---|
| idle | 显示「已绑定」与「测试绑定状态」 | 维持现有扫描入口 |
| checking | 测试按钮禁用并显示「测试中」 | 不受影响 |
| reachable | 显示「可连接」及检查时间 | 不受影响 |
| unreachable | 显示「不可连接」与「重新关联」 | 进入关联模式后选择扫描结果 |
| profile mismatch | 显示「配置不匹配」，不允许静默接管 | 可取消关联并选择其他设备 |
| rebinding | 原绑定卡片保持可见，相关操作禁用 | 每个发现结果显示「重新关联」 |
| error | 页面状态条显示可操作错误 | 扫描数据仍按原生命周期清理 |

移动端沿用单列卡片，操作按钮允许换行。所有颜色、边框和状态提示复用 Settings 语义 token。

## API 契约

- `POST /api/limb/ble/bindings/:bindingId/probe`
  - 成功返回 `reachable`、`checkedAt`。
  - 连接或 GATT 检查失败返回 `unreachable`、受限 `reason`、`checkedAt`，HTTP 仍为 200。
  - 绑定不存在返回 404。
- `POST /api/limb/ble/bindings/:bindingId/rebind`
  - body 只接受 `{ sessionId, discoveryId }`。
  - 校验当前发现、目标占用、并发 reservation、adapter 与命令集合。
  - 成功返回不含平台标识的绑定视图；能力不兼容返回 422，冲突返回 409。

## TDD 顺序

1. 红：旧标识探测失败返回结构化 `unreachable`；成功探测更新 `lastConnectedAt`。
2. 红：新标识显式重关联后保留 `bindingId` / `nodeId`，后续调用使用新标识。
3. 红：拒绝 stale discovery、已被其他绑定占用的设备、并发重关联和不兼容 profile。
4. 绿：实现 manager 的 probe / rebind 与持久化原子顺序。
5. 红：路由验证会话身份、不透明 ID 请求体、404 / 409 / 422 与平台标识隐私。
6. 绿：实现 operator routes。
7. 红：Settings 覆盖测试中、可连接、不可连接、显式确认与重新关联的不透明 ID 请求体。
8. 绿：实现绑定卡片状态与扫描关联模式。
9. 真实设备：轮换广播标识 → probe 失败 → rebind → probe 成功 → Limb 读取更新值。

## 完成证据

- API focused tests、Web focused tests、TypeScript、Biome 与目录门禁全绿。
- 真实 Mate 40 / Mate 70 轮换身份场景完成恢复，且 Redis 绑定记录仍只有原 binding ID。
- UI 至少验证桌面 golden path 与一个不可连接状态；不修改聊天或其他 Settings 分区。
