---
feature_ids: []
topics: [architecture, acp, provider-profile, configuration]
doc_kind: note
created: 2026-03-27
---

# ACP 配置说明

> Cat Cafe / Clowder AI 内如何配置 ACP provider、ACP model profile，以及如何把 cat 绑定到外部 ACP agent。

## 概述

Clowder 里的 ACP 接入分成三层：

1. **ACP Provider Profile**
   定义如何启动外部 ACP agent 进程，例如 `agent-teams gateway acp stdio` 或 `opencode acp`。
2. **ACP Model Profile**
   仅在 `clowder_default_profile` 模式下使用，由 Clowder 把模型参数和密钥下发给 ACP agent。
3. **Cat 绑定**
   在 cat catalog 里把某只猫的 `client` 设为 `acp`，并绑定到前面创建的 ACP provider。

这三层都配好之后，前端里 `@cat` 才能真正走到 `ACP session/new -> session/prompt`。

## 两种运行模式

### 1. `self_managed`

适合 ACP agent 自己管理模型和密钥的场景，例如 `opencode acp`。

- Clowder 只负责启动 ACP agent 进程
- 模型、base URL、凭据由 agent 自己读取
- 不需要额外创建 ACP Model Profile

推荐示例：

```text
displayName: opencode-acp
kind: acp
command: opencode
args: acp
cwd: /path/to/project
modelAccessMode: self_managed
```

### 2. `clowder_default_profile`

适合 ACP agent 支持 `modelProfileOverride` 的场景，例如 `agent-teams`。

- Clowder 会在 `session/new` 或 `session/load` 时下发模型配置
- 需要先创建 ACP Model Profile
- ACP agent 不需要自己再找 OpenAI / OpenRouter / BigModel 凭据

推荐示例：

```text
displayName: agent-teams
kind: acp
command: agent-teams
args: gateway acp stdio
cwd: /opt/workspace/agent-teams
modelAccessMode: clowder_default_profile
defaultModelProfileRef: agent-teams
```

## 推荐配置

### agent-teams

先安装 CLI：

```bash
pip install cool-play-agent-teams
```

如果机器上没有系统 `pip`，可以用等价方式：

```bash
uv tool install cool-play-agent-teams
```

创建 provider 时推荐使用：

```text
command: agent-teams
args: gateway acp stdio
cwd: /opt/workspace/agent-teams
modelAccessMode: clowder_default_profile
defaultModelProfileRef: agent-teams
```

说明：

- `command` 直接写 `agent-teams`，不要再依赖 `uv --directory ... run`
- `cwd` 可以保留成 agent-teams 仓库路径，便于本地诊断和读取仓库态说明文件
- `defaultModelProfileRef` 要指向一个存在且带密钥的 ACP Model Profile

### opencode

创建 provider 时推荐使用：

```text
command: opencode
args: acp
cwd: /path/to/project
modelAccessMode: self_managed
```

说明：

- `opencode` 走自管模型模式更自然
- 不需要给它配 ACP Model Profile
- Clowder 只负责 ACP 会话，不接管它的 provider / credential 体系

## 在 Hub 里的配置顺序

### A. 创建 ACP Model Profile

仅 `clowder_default_profile` 需要。

最少需要填写：

- `displayName`
- `provider`
- `model`
- `baseUrl`
- `apiKey`

当前 secrets 会分开落盘，不会从普通 GET 接口里直接回显。

### B. 创建 ACP Provider Profile

最少需要填写：

- `displayName`
- `command`
- `args`
- `modelAccessMode`

按需填写：

- `cwd`
- `defaultModelProfileRef`

### C. 创建或修改 cat

把目标猫配置成：

```text
client: acp
accountRef: <providerProfileId>
```

常见做法：

- `agentteams` 绑定 `agent-teams`
- `opencodeacp` 绑定 `opencode-acp`

## 测试方法

### 1. Provider 自检

先在 Hub 里点 `Test`，或者直接打：

```bash
curl -X POST http://127.0.0.1:3004/api/provider-profiles/<profileId>/test \
  -H 'Content-Type: application/json' \
  -H 'X-Cat-Cafe-User: default-user' \
  -d '{"projectPath":"/path/to/project"}'
```

期望返回：

```json
{"ok":true,"mode":"none","status":200}
```

### 2. 浏览器端到端

Provider test 通过后，再在对话框里直接发：

```text
@agentteams 请只回复一句“ACP OK”。
```

或：

```text
@opencodeacp 请只回复一句“ACP OK”。
```

如果链路正常，右侧 `Session Chain` 会出现新的 ACP session，消息气泡里会显示：

- 正文回复
- `providerId · acp` 的 metadata badge

## 排障

### `command not found`

- 确认 CLI 已安装
- 确认服务进程的 PATH 能解析到对应命令
- 对 `agent-teams`，优先检查 `which agent-teams`

### `ACP model profile ... not found or missing apiKey`

- `defaultModelProfileRef` 指向了不存在的 profile
- 或者 profile 元数据存在，但 secrets 里没有 apiKey

### `modelProfileOverride requires model, baseUrl, and apiKey`

- 说明这条链路跑的是 `clowder_default_profile`
- 但运行时拿到的 ACP Model Profile 不完整
- 优先通过 Hub/API 读取运行态 profile，不要只看明文 meta 文件

### ACP agent 能启动，但前端里 `@cat` 不出现

- 检查 cat catalog 里是否有对应 `client: acp` 的猫
- 检查 `accountRef` 是否绑定到了正确的 provider profile
- 检查 mention pattern 是否包含你实际输入的 `@name`

## 存储位置

- provider 元信息：`.cat-cafe/provider-profiles.json`
- provider secrets：`.cat-cafe/provider-profiles.secrets.local.json`
- ACP model 元信息：`.cat-cafe/acp-model-profiles.json`
- ACP model secrets：`.cat-cafe/acp-model-profiles.secrets.local.json`

普通配置文件可以进项目态，secrets 文件不要进 Git。
