---
feature_ids: [F258]
related_features: [F126, F179, F190]
topics: [bluetooth, ble, limb, macos, implementation-plan, testing]
doc_kind: plan
created: 2026-07-14
---

# F258 Phase A 实施计划

## 交付目标

Phase A 在 macOS 上交付一条可验证的 BLE Central / GATT 垂直切片：operator 可以在设置页发起限时扫描、查看会话内设备、显式绑定标准传感器，并让猫猫通过 F126 Limb 控制面读取类型化的环境数据或电量。

CoreBluetooth 运行在独立 helper 进程。API 进程只接收版本化协议消息，不加载第三方 BLE 运行时依赖。任意 GATT 写入不进入协议命令集。

## 已确认的作用域决策

### 绑定归属

Phase A 的绑定采用「当前 Clowder 实例作用域」，不增加无可靠来源的 `userId`：

- `LimbRegistry`、`LimbAccessPolicy` 和当前 Limb 路由都是实例级对象，没有可信的用户身份上下文。
- Redis 客户端现有 `keyPrefix` 提供实例 namespace 隔离；BLE 键只保存当前实例内的绑定。
- 存储键预留 `scopeId` 字段，Phase A 固定为 `instance`。如果后续引入多租户认证，迁移到 per-user 或 per-workspace scope 时无需改绑定实体格式。
- 生产环境没有 Redis 时，不注册绑定写接口，也不回退到内存存储。内存实现仅用于单元测试。

这项决策避免把进程级节点错误包装成 per-user 安全边界。未来多租户化必须同时升级 API 身份、`LimbRegistry.invoke()` 上下文和节点可见性，不能只修改 Redis key。

### Console 入口

新增 L2 `/settings?s=devices` 分区，名称为「设备与 Limb」。不复用「通知」分区：

- 「通知」管理消息投递与提醒策略。
- BLE 扫描、绑定、权限和连接状态属于硬件管理。
- Phase B 的事件到通知或工作流映射可以在对应产品域引用绑定设备，但设备身份真相源仍在「设备与 Limb」。

不增加 Activity Bar 入口，不触碰聊天、消息气泡或现有通知写入路径。

## Console 四道门禁

### Product Gate

| 状态 | 桌面端行为 | 移动端行为 |
|---|---|---|
| loading | 显示状态条和骨架卡片 | 单列显示 |
| empty | 说明尚未绑定设备，提供「扫描附近设备」 | 同一动作，卡片纵向排列 |
| scanning | 显示剩余时间、临时发现结果和「停止扫描」 | 结果单列，主操作保持可见 |
| results | 每个结果显示设备名、信号强度和支持的标准服务 | 隐藏次要诊断字段 |
| bound | 显示 adapter、最近状态、可读能力和「解除绑定」 | 单列显示能力摘要 |
| degraded | 显示 helper 失败原因和可重试状态，不影响其他设置页 | 同桌面端 |
| error | 显示可操作错误；扫描数据不跨会话保留 | 同桌面端 |
| unsupported | 非 macOS 平台显示当前不支持，不尝试 spawn helper | 同桌面端 |

当前 Console 没有成员角色级页面授权模型，因此 owner / member / guest 状态不伪造差异。BLE 路由沿用本地 Hub 的访问边界；绑定动作仍要求显式按钮操作。

### Design-System Gate

- 复用 `SettingsPageHeader`、`SettingsSection`、`SettingsCard`、`SettingsStatusStrip`、`SettingsEmptyState`、`SettingsPrimaryButton` 和 `SettingsSecondaryButton`。
- 颜色、边框、间距和状态全部使用现有语义 token。
- 不新增 BLE 专属全局 CSS，不扩大现有 token 豁免。

### Implementation Gate

- `BleDevicesContent` 负责页面状态和 API 调用。
- 扫描结果、已绑定设备和状态提示拆为视觉独立组件；单文件超过 200 行时复核拆分。
- `apiFetch` 的读取结果与提交 payload 分离。绑定请求只提交当前扫描会话返回的 opaque discovery ID 和已知 adapter ID。
- 不向前端返回原始 manufacturer data、任意 characteristic UUID 写入口或 helper 路径。

### Verification Gate

- Golden path：空状态 → 扫描 → 发现标准设备 → 绑定 → 已绑定列表 → 类型化读取。
- 非 happy path：非 macOS、蓝牙权限拒绝、helper crash 后 degraded、扫描超时自动清空。
- 路由证明：`devices` deep link 可恢复，搜索可命中，不影响 `notify`、`ops` 和 `members`。
- 浏览器证明：桌面宽度与移动端宽度各一张，至少包含 scanning 和 degraded 中的一种非 happy path。

## 模块设计

### Core 协议与进程边界

新增 `packages/api/src/domains/limb/ble/`：

| 模块 | 职责 |
|---|---|
| `BleHelperProtocol.ts` | 校验 handshake、request、response 和 event；限制消息大小与字段长度 |
| `BleHelperClient.ts` | lazy spawn、请求关联、超时、1 秒 / 2 秒 / 4 秒重启和 degraded 状态 |
| `BleScanSession.ts` | 单个 30 秒扫描会话、显式停止和临时发现结果清理 |
| `BleBindingStore.ts` | 绑定 port、Redis 实现和测试专用内存实现；TTL 为 0 |
| `BleAdapters.ts` | Battery 与 Environmental Sensing allowlist、解码和范围校验 |
| `BleLimbNode.ts` | 把单个绑定设备映射为 F126 `ILimbNode`，只暴露类型化 read 命令 |
| `BleDeviceManager.ts` | 编排扫描、绑定、节点注册、读取与解绑 |

helper 请求格式：

```json
{"protocol":"ble-helper","version":1,"requestId":"…","command":"scan.start","params":{"timeoutMs":30000}}
```

helper 启动时先发送：

```json
{"protocol":"ble-helper","version":1,"kind":"hello"}
```

允许命令固定为：

- `scan.start`
- `scan.stop`
- `device.inspect`
- `gatt.read`
- `gatt.subscribe`
- `device.disconnect`
- `helper.shutdown`

协议没有 `write` 命令。未知命令、未知版本、超长行和无效 JSON 均返回可审计错误，不执行设备操作。

### 持久绑定

绑定实体保存以下最小字段：

- `bindingId`
- `scopeId`
- `platformDeviceId`
- `displayName`
- `adapterId`
- `commands`
- `nodeId`
- `createdAt`
- `lastConnectedAt`

不保存扫描 RSSI 历史、未绑定设备、manufacturer data 或广播名称历史。Redis 使用一个绑定索引和按 ID 的 JSON 记录；写入不设置 EXPIRE。解绑是唯一删除入口，同时注销对应 `BleLimbNode`。

### 标准 adapter

Phase A 内置：

- Battery Service `0x180F` / Battery Level `0x2A19`
- Environmental Sensing Service `0x181A`
- Temperature `0x2A6E`
- Humidity `0x2A6F`

解码器验证长度、单位和有效范围。错误数据返回结构化失败，不进入 Action Log artifact，不抛出未处理异常。

### macOS helper

新增 `native/ble-helper/macos/` Swift 源码和嵌入式 `Info.plist`：

- 使用 `CBCentralManager` 扫描、连接、发现服务、读取和订阅。
- stdout 只写 NDJSON 协议；诊断写 stderr。
- 单行最大 64 KiB，设备名最大 128 个字符，通知 payload 最大 4 KiB。
- CoreBluetooth 回调在一个进程内 multiplex 多台设备。
- 编译结果按架构放到 `bundled/ble-helper-darwin-${arch}/ble-helper`，由 Desktop `extraResources` 打包。
- Desktop app 与 helper 都声明 Bluetooth usage description。

## TDD 顺序

1. 红：协议拒绝未知版本、未知命令、超长和格式错误消息。
2. 绿：实现协议 schema 与安全上限。
3. 红：进程客户端 handshake 超时、请求超时、crash 重启和三次后 degraded。
4. 绿：实现可注入 transport 的 `BleHelperClient`。
5. 红：扫描会话 30 秒超时、显式停止和结果清理。
6. 绿：实现 `BleScanSession`。
7. 红：Redis 绑定重启恢复、TTL 为 0、解绑删除和损坏记录隔离。
8. 绿：实现 store 与 manager hydration。
9. 红：Battery / Temperature / Humidity 解码、范围与错误长度。
10. 绿：实现 adapter 与 `BleLimbNode`，验证未绑定设备不能调用、任意写命令被拒绝。
11. 红：BLE API 的平台状态、扫描、绑定、解绑与错误码。
12. 绿：实现 routes 与 API 初始化。
13. 红：Settings routing、搜索、loading / empty / scanning / degraded。
14. 绿：实现 `devices` 分区和组件。
15. 编译 Swift helper，执行协议 smoke test 和 Desktop packaging 路径测试。

## 测试矩阵

| 层级 | 重点用例 | 证据 |
|---|---|---|
| 协议单测 | version、message size、command allowlist、response correlation | focused test |
| 进程单测 | lazy spawn、handshake、timeout、crash、1/2/4 秒退避、degraded | fake transport + fake timer |
| 扫描单测 | stop 与 30 秒 timeout 取先到者、临时结果清空 | fake clock |
| 存储单测 | Redis restart hydration、无 EXPIRE、坏记录隔离、解绑 | isolated Redis namespace |
| adapter 单测 | 标准值、边界值、长度错误、NaN / out-of-range | table-driven test |
| Registry 集成 | 绑定后注册、Policy / Lease / Action Log、解绑失效 | existing F126 fixtures |
| API 集成 | unsupported、扫描生命周期、显式绑定、无 Redis fail-closed | Fastify inject |
| Web 单测 | deep link、搜索、状态矩阵、按钮 payload | Vitest / Testing Library |
| Swift 测试 | 编译、hello、未知命令拒绝、shutdown | shell smoke test |
| 真实硬件 | 绑定、读取、断连恢复、Action Log | Phase A acceptance bundle |

## 完成条件与外部依赖

代码完成要求 AC-A1 至 AC-A7 全部有自动化证据，并在 macOS 上完成 helper 编译和协议 smoke test。AC-A8 需要一台真实 BLE 环境传感器；没有硬件时必须明确保留为外部验收依赖，不能用 mock 结果标记完成。
