---
feature_ids: [F258]
related_features: [F126, F124, F202, F246, F254]
topics: [bluetooth, ble, gatt, limb, hardware, sensor, event, privacy]
doc_kind: spec
created: 2026-07-14
---

# F258: BLE Physical Event Limb — 可审计的物理事件总线

> **Status**: in-progress (Phase A implementation complete; hardware acceptance and implementation review pending) | **Owner**: Maine Coon Sol (GPT-5.6 Sol) | **Priority**: P1

## Why

operator 在 2026-07-14 的蓝牙能力讨论中批准立项。三猫讨论形成的共同判断是：蓝牙的首要价值不是「连接设备」，而是让 Clowder AI 通过 Limb 接入本地物理世界的状态与事件。

F126 已提供 `ILimbNode`、Capability Registry、访问策略、租约和 Action Log，但还没有真实的本机低功耗蓝牙设备节点。F258 在这套控制面上增加 BLE Central / GATT 设备族，使环境传感器和实体按钮可以被发现、绑定、读取和订阅，并以类型化能力提供给猫猫与工作流。

首发目标是「Observe + Trigger」：读取传感器状态，接收按钮或设备通知，并形成可审计事件。普通 BLE proximity 不构成可靠身份认证，不能单独授权 force push、删除数据、修改配置等敏感操作。

来源：`thread_mrkr4fwxxhjktmdz`；operator 立项消息 `0001784040818947-001421-e1915a66`；方向说明 `0001784040583216-001420-157505a3`。

## Product Boundary

### 首发范围

- 仅支持 BLE Central / GATT，不承诺完整蓝牙协议栈。
- 用户主动扫描并绑定设备；未绑定设备不能被猫猫调用。
- 默认支持 `read` 和 `notify`；任意 GATT `write` 默认拒绝。
- 内置 Battery Service、Environmental Sensing Service 和按钮通知适配器。
- 原始扫描结果只保留在当前扫描会话内。扫描会话从用户主动调用 `startScan()` 开始，到 `stopScan()` 或 30 秒超时结束，以先发生者为准；结束时清空未绑定设备列表。只有显式绑定的设备与工作流映射持久保存，TTL 为 0。
- 首个真实验收组合为「环境传感器 + BLE 按钮」：读取环境数据，并由实体按钮触发一条可追踪的 Cat Café 工作流事件。

### 不在首发范围

- Bluetooth Classic、蓝牙音箱、耳机、键盘、打印机和 LE Audio。
- 将 RSSI、设备名称或「手机在附近」作为身份认证或敏感操作授权依据。
- 手机离线通信桥、BLE Peripheral 角色和端到端消息协议。
- Agent 直接操作原始 GATT UUID、扫描参数或任意字节写入。
- 对私有、加密或需要厂商初始化握手的设备承诺通用兼容。

## What

### Architecture

```text
Agent / Workflow
       ↓
F126 Limb Registry + Policy + Action Log
       ↓
BleLimbNode + Limb Event Bus
       ↓
Device Adapter Registry
       ↓
Platform Helper Protocol
       ├── macOS CoreBluetooth
       ├── Linux BlueZ / D-Bus
       └── Windows WinRT
       ↓
BLE Device
```

F258 不复制 F126 的 Registry、Policy、Lease 或 Action Log。`BleLimbNode` 作为普通 `ILimbNode` 注册读能力；事件能力通过可选的 `ILimbEventSource` 接口接入 `LimbEventBus`，避免要求所有既有 Limb 节点实现订阅接口。

平台差异收敛在独立 helper 进程中。Core 使用版本化 NDJSON 协议与 helper 通信，不直接依赖某个 Node.js BLE 库。helper 只接受受限命令，并对消息大小、通知频率、超时和断连进行边界检查。

每个平台只运行一个 helper 进程，由首次 BLE 请求按需启动，并在进程内复用多设备连接。helper 启动后必须先发送 `{"protocol":"ble-helper","version":1}` 握手；Core 遇到未知协议或版本时直接拒绝。helper 异常退出后最多自动重启 3 次，间隔为 1 秒、2 秒和 4 秒；仍然失败时将 BLE capability 标记为 `degraded`，不得使 API 进程退出。

### Phase A: macOS 真实垂直切片

在 macOS 上交付一个可用的 BLE Limb：扫描、显式绑定、连接、读取标准特征值和订阅通知。实现使用系统 CoreBluetooth，由平台 helper 提供能力，不引入第三方 BLE 运行时依赖。

设备绑定使用持久存储接口；生产实现不得使用仅内存存储。扫描会话、RSSI 样本和未绑定设备信息不进入长期存储。扫描会话结束时，未绑定设备列表立即清空。所有写操作在 Core、adapter 与 helper 三层均默认拒绝。

### Phase B: 类型化事件与 Adapter 工具

新增 `LimbEventEnvelope` 与有界事件队列，包含稳定事件 ID、节点 ID、绑定设备 ID、adapter ID、事件类型、观测时间、幂等键和最小 provenance。事件基础设施属于 F126 的通用 Limb 类型与实现空间，F258 是首个消费方，不建立 BLE 专属事件总线。

每台设备的队列深度上限为 256 条，去重窗口为 5 秒；队列满时执行 `drop-oldest` 并记录 warning。通知流还需要限速和断连恢复，设备断连或通知洪泛不能拖垮 API 进程。

提供 GATT Explorer，展示已授权设备的服务与特征值，并生成 adapter 草稿。adapter manifest 明确列出允许读取或订阅的 characteristic、解码规则、单位和输出 schema；草稿必须经过用户确认后才能启用。Explorer 不提供任意写入入口。

### Phase C: 工作流接入、跨平台与受控写入

将类型化 BLE 事件接入 Cat Café 工作流。工作流绑定是用户可见、可恢复的数据，默认 TTL 为 0；消费端按幂等键去重，并保留来源设备、adapter 与原始事件 ID。

在 Linux 和 Windows 上实现同一 helper 协议，平台不支持或权限未授予时返回明确的 capability 状态。受控写入只允许 adapter 声明的类型化命令，并继续经过 F126 Access Policy 和 Action Log；不向 Agent 暴露任意 GATT 字节写入。

## User Journey

### 环境传感器与实体按钮

1. operator 打开 BLE 设备发现入口，系统显示当前扫描会话内的附近设备。
2. operator 选择传感器或按钮，查看请求的 GATT 服务与权限，然后确认绑定。
3. 绑定完成后，猫猫通过 Limb 能力读取温度、湿度或电量，不接触原始 characteristic。
4. operator 将按钮的类型化事件绑定到一个 Cat Café 工作流。
5. 按下实体按钮后，工作流只执行一次；事件详情可追溯到设备、adapter、时间和 Action Log。
6. 解除绑定后，设备能力和工作流订阅立即失效，持久记录按数据保留规则处理。

## Acceptance Criteria

### Phase A（macOS 真实垂直切片）

- [x] AC-A1: `BleLimbNode` 复用 F126 Registry、Policy、Lease 和 Action Log，不创建平行控制面。
- [x] AC-A2: Core 与 helper 使用版本化、可校验的 NDJSON 协议；测试覆盖未知版本、无效消息、请求超时、helper crash、1 秒/2 秒/4 秒退避重启与超过 3 次后标记 `degraded`，以上情况均不会导致 API 进程退出。
- [x] AC-A3: macOS CoreBluetooth helper 可完成扫描、显式绑定、连接、标准特征值读取和通知订阅。
- [x] AC-A4: 未绑定设备不能被猫猫调用；扫描会话由 `stopScan()` 或 30 秒超时结束，以先发生者为准；结束后扫描结果、RSSI 样本和未绑定设备信息不保留。
- [x] AC-A5: 设备绑定使用生产级持久存储，默认 TTL 为 0；仅内存实现只允许用于测试。
- [x] AC-A6: Battery Service 与 Environmental Sensing Service 映射为类型化 Limb capability，包含单位、范围校验和解码错误处理。
- [x] AC-A7: 任意 GATT `write` 在默认配置下被 Core、adapter 和 helper 一致拒绝，并产生可审计的拒绝结果。
- [ ] AC-A8: 至少一台真实 BLE 传感器完成端到端验收，证据包含设备绑定、读取结果、断连恢复和 Action Log。

### Phase B（类型化事件与 Adapter 工具）

- [ ] AC-B1: `ILimbEventSource` 是 F126 通用 Limb 类型空间中的可选扩展；既有 `ILimbNode` 实现无需修改即可继续工作，F258 只作为首个消费方。
- [ ] AC-B2: `LimbEventEnvelope` 包含稳定事件 ID、节点 ID、绑定设备 ID、adapter ID、事件类型、观测时间、幂等键和最小 provenance。
- [ ] AC-B3: 每台设备的通知队列上限为 256 条，去重窗口为 5 秒，队列满时执行 `drop-oldest` 并记录 warning；通知流还具有限速与断连恢复，通知洪泛测试不会造成 API 内存无界增长。
- [ ] AC-B4: GATT Explorer 只显示已授权设备，能生成 adapter 草稿，但不能执行任意写入。
- [ ] AC-B5: adapter manifest 对 characteristic allowlist、解码规则、单位和输出 schema 进行校验；未声明 characteristic 不可访问。
- [ ] AC-B6: 至少一台真实 BLE 按钮可产生类型化事件，重复通知按幂等规则只形成一个逻辑事件。

### Phase C（工作流接入、跨平台与受控写入）

- [ ] AC-C1: BLE 按钮事件可触发一条 Cat Café 工作流，事件、工作流执行与 Action Log 可以互相追溯。
- [ ] AC-C2: 工作流绑定持久保存且默认 TTL 为 0；重启后绑定可恢复，解除绑定后不再触发。
- [ ] AC-C3: Linux BlueZ / D-Bus helper 与 Windows WinRT helper 通过同一协议通过契约测试。
- [ ] AC-C4: 平台不支持、蓝牙关闭或权限未授予时，Limb capability 返回明确的 unavailable / degraded 原因。
- [ ] AC-C5: 受控写入只允许 adapter 声明的类型化命令，并经过 F126 Access Policy 与 Action Log；不存在 Agent 可调用的任意字节写入接口。
- [ ] AC-C6: RSSI 或 presence 信号不能单独提升敏感操作权限；相关安全测试覆盖伪造标识和重放事件。

## Tips Contribution（F244）

- [x] 新增「绑定 BLE 设备前核对权限」提示。
- [x] 新增「BLE proximity 不能作为敏感操作认证」提示。

## Dependencies

- **Evolved from**: F126（复用 Limb 控制面、权限、租约和审计能力）
- **Related**: F124（Apple 设备作为 Limb 的长期方向；F258 首发不实现 iOS / watchOS Peripheral）
- **Related**: F202（未来 adapter 可作为 plugin resource 分发；首发不要求插件框架改造）
- **Related**: F246（显式设备绑定需要用户确认，但不进入通用 Approval Hub 首发范围）
- **Related**: F254（工作流触发产生副作用前继续服从 freshness gate）
- **External acceptance dependency**: 真实 BLE 环境传感器与按钮各一台

## Security and Privacy Invariants

1. 扫描附近设备属于本地隐私数据，默认不持久保存，不写入记忆索引，不用于用户画像。
2. 绑定必须由用户主动确认；设备广播名称、RSSI 和 MAC 地址都不能作为可信身份。
3. Agent 只能调用 adapter 暴露的类型化能力，不能读取任意 characteristic 或写入任意字节。
4. 设备输入按不可信数据处理：限制长度、频率、解析深度和执行时间，不把设备字符串拼接到 shell 命令。
5. 医疗、门锁、车辆和支付类设备默认不支持写入；后续支持需单独安全审查。
6. 所有用户可见绑定与工作流映射默认持久保存，TTL 为 0；删除只能由明确的解绑操作触发。

## Risk

| 风险 | 缓解 |
|------|------|
| macOS、Linux 和 Windows 的设备标识与权限语义不同 | 设备身份不跨平台推断；helper 返回平台原生标识和明确 capability 状态 |
| 恶意设备发送超长或高频通知 | helper 与 Core 双层限长、限速、背压和超时；通知洪泛纳入自动化测试 |
| 私有 GATT 协议碎片化 | 标准 profile 内置；私有设备通过显式 adapter 接入，不承诺自动兼容 |
| 第三方 BLE 库维护或原生构建不稳定 | Core 只依赖稳定 helper 协议；各平台优先使用系统蓝牙 API |
| 设备名称或地址被伪造 | 绑定记录不把广播名称作为身份；敏感能力仍由 F126 Policy 决定 |
| 事件重复导致工作流重复执行 | 事件 ID、幂等键、去重窗口和消费端幂等共同约束 |
| 原始扫描数据进入持久层 | 存储接口拒绝未绑定设备；测试验证扫描会话结束后无持久记录 |

## Open Questions

| # | 问题 | 状态 |
|---|------|------|
| OQ-1 | macOS 最低支持版本与 helper 的签名、权限声明如何进入桌面分发流程 | ✅ macOS 13+；Desktop 与 helper 均嵌入蓝牙权限文案，helper 随 `extraResources` 打包并沿用 Desktop ad-hoc codesign 流程 |
| OQ-2 | 首套硬件验收设备选型：标准 Environmental Sensing 设备与按钮型号 | ⬜ 需要真实硬件确认 |
| OQ-3 | 第一条按钮工作流使用现有哪一种触发目标作为稳定演示 | ⬜ Phase B Design Gate 确认 |
| OQ-4 | adapter manifest 在 F202 plugin resource 中的长期类型名与版本策略 | ⬜ Phase B 前确认 |

## Key Decisions

| # | 决策 | 理由 | 日期 |
|---|------|------|------|
| KD-1 | F258 是 F126 上的设备族，不新建 Limb 控制面 | Registry、Policy、Lease 和 Action Log 已存在，重复实现会造成真相源分裂 | 2026-07-14 |
| KD-2 | 首发只做 BLE Central / GATT | Bluetooth Classic、HID、Audio 与 GATT 的系统栈和产品边界不同 | 2026-07-14 |
| KD-3 | 首发优先 Observe + Trigger，任意写入默认关闭 | 传感器与按钮能形成真实价值，同时控制安全面 | 2026-07-14 |
| KD-4 | BLE proximity 不作为敏感操作认证 | RSSI、设备标识和近场状态不能证明用户身份或当前同意 | 2026-07-14 |
| KD-5 | 平台差异收敛到原生 helper，Core 使用版本化协议 | 避免将产品能力绑定到单个 Node.js BLE 库，并隔离平台权限语义 | 2026-07-14 |
| KD-6 | 事件能力使用 F126 通用类型空间中的可选 `ILimbEventSource`，F258 是首个消费方 | 保持 F126 既有实现兼容，同时避免形成 BLE 专属事件基础设施 | 2026-07-14 |
| KD-7 | 扫描数据临时保存，显式绑定与工作流映射永久保存 | 同时满足附近设备隐私与用户状态可恢复要求 | 2026-07-14 |
| KD-8 | 每个平台一个 helper，首次 BLE 请求时按需启动；握手版本固定为 1，crash 最多按 1 秒/2 秒/4 秒退避重启 3 次 | 无 BLE 请求时保持零运行开销；失败隔离在 helper，不影响 API 主进程 | 2026-07-14 |
| KD-9 | 扫描会话最长 30 秒，可由 `stopScan()` 提前结束；结束时清空未绑定设备 | 为扫描隐私数据定义可验证的内存生命周期 | 2026-07-14 |
| KD-10 | 单设备事件队列上限 256 条、去重窗口 5 秒、满队列时 `drop-oldest` 并记录 warning | 传感器流优先保留最新值，同时为内存占用与重复通知建立确定边界 | 2026-07-14 |

## Timeline

| 日期 | 事件 |
|------|------|
| 2026-07-14 | 三猫讨论 BLE 能力方向；operator 批准立项 |
| 2026-07-14 | 分配 F258，完成查重、产品边界和首版 Phase 设计 |
| 2026-07-14 | Opus 4.6 跨 family Design Gate 放行；补齐事件归属、队列参数、helper 生命周期和扫描会话定义 |
| 2026-07-15 | Phase A 代码与自动化证据完成：API 41 项、Console 16 项、Swift 协议 smoke 全绿；AC-A8 等待真实 BLE 传感器验收，代码等待跨个体 review |

## Review Gate

- Phase A：跨 family 架构与安全 review；真实硬件证据必须包含断连恢复和拒绝写入。
- Phase B：事件契约与背压需要 Maine Coon 安全 review；Adapter UX 需要 Design Gate。
- Phase C：跨平台 helper 与受控写入属于高风险能力，需要跨 family review 和独立愿景守护。

## Links

| 类型 | 路径 | 说明 |
|------|------|------|
| **Feature** | `docs/features/F126-limb-control-plane.md` | Limb Registry、Policy、Lease、Action Log 真相源 |
| **Feature** | `docs/features/F124-apple-ecosystem-voice-interaction.md` | Apple 设备长期接入方向 |
| **Feature** | `docs/features/F202-plugin-framework.md` | adapter plugin resource 的潜在承载面 |
| **Implementation plan** | `docs/features/assets/F258/phase-a-implementation-plan.md` | Phase A 作用域决策、模块设计与测试矩阵 |
| **Source thread** | `thread_mrkr4fwxxhjktmdz` | 立项讨论与 operator 批准 |
