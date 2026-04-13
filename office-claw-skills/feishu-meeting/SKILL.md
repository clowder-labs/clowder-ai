---
name: feishu-meeting
description: 通过飞书API创建会议，支持设置主题、时间、参与人等；当用户需要创建飞书会议、预定会议或安排会议时使用
---

# 飞书会议创建

## 任务目标
- 本 Skill 用于：通过飞书开放平台API创建在线会议
- 能力包含：设置会议主题、开始时间、时长、参与人、会议描述
- 触发条件：用户表达"创建飞书会议"、"预定会议"、"安排会议"、"发起会议"等需求

## 前置准备

### 凭证配置
本 Skill 需要飞书 OAuth 授权，使用前请完成以下配置：
1. 访问 https://open.feishu.cn/app 创建飞书应用
2. 获取 App ID 和 App Secret
3. 配置 OAuth 权限：meeting:meeting:write
4. 在 Skill 运行时完成授权

## 操作步骤

### 标准流程

#### 步骤 1：收集会议信息
智能体与用户交互，收集以下必要信息：
- **会议主题**（必需）：会议的标题或主题
- **开始时间**（必需）：会议开始时间，格式为 ISO 8601（例如：2025-06-18T14:00:00+08:00）
- **会议时长**（可选）：持续时间（分钟），默认为 60 分钟
- **参与人**（可选）：参会人员的 user_id 列表，逗号分隔
- **会议描述**（可选）：会议的详细说明或议程

#### 步骤 2：调用脚本创建会议
收集完信息后，调用脚本创建会议：

```bash
python /workspace/projects/feishu-meeting/scripts/create_meeting.py \
  --title "会议主题" \
  --start-time "2025-06-18T14:00:00+08:00" \
  --duration 60 \
  --user-ids "user_id1,user_id2" \
  --description "会议描述"
```

脚本会：
1. 从环境变量获取 OAuth access_token
2. 调用飞书会议创建 API
3. 处理可能的错误（权限不足、参数错误等）
4. 返回会议链接和会议 ID

#### 步骤 3：返回会议信息
智能体将脚本返回的信息以友好的方式展示给用户：
- 会议链接
- 会议 ID
- 会议时间
- 参与人信息

### 错误处理

常见错误及处理方式：
- **授权失败**：提示用户检查 OAuth 凭证配置
- **权限不足**：提示用户确认应用已授予会议创建权限
- **参数错误**：提示用户检查会议主题和时间格式
- **API 调用失败**：显示具体错误码和建议解决方案

## 资源索引

- **必要脚本**：[scripts/create_meeting.py](scripts/create_meeting.py)（用途：调用飞书 API 创建会议）
- **领域参考**：[references/feishu-api.md](references/feishu-api.md)（何时读取：需要了解 API 参数和错误码时）

## 注意事项

1. **时间格式**：开始时间必须使用 ISO 8601 格式，包含时区信息
2. **用户 ID**：参与人的 user_id 可以通过飞书用户管理 API 获取
3. **权限配置**：确保飞书应用已授予 `meeting:meeting:write` 权限
4. **会议链接**：创建成功后，会议链接会立即返回，可直接分享给参会者
5. **时区处理**：建议使用与用户一致的时区，避免时间混淆

## 使用示例

### 示例 1：创建基础会议
```bash
python /workspace/projects/feishu-meeting/scripts/create_meeting.py \
  --title "周例会" \
  --start-time "2025-06-18T10:00:00+08:00" \
  --duration 90
```

### 示例 2：创建带参与人的会议
```bash
python /workspace/projects/feishu-meeting/scripts/create_meeting.py \
  --title "产品评审会" \
  --start-time "2025-06-18T14:30:00+08:00" \
  --duration 120 \
  --user-ids "ou_xxx,ou_yyy,ou_zzz" \
  --description "评审产品需求和设计方案"
```

### 示例 3：智能体交互流程
用户："帮我创建一个飞书会议"

智能体：
1. "好的，我来帮你创建飞书会议。请告诉我：
   - 会议主题是什么？
   - 什么时候开始？（请提供具体日期和时间）
   - 会议持续多长时间？"

用户："周三下午3点开产品评审会，持续2小时"

智能体：
1. 解析时间并转换为 ISO 8601 格式
2. 收集参与人信息（可选）
3. 调用 create_meeting.py 脚本
4. 返回会议链接和相关信息

"已成功创建会议！
会议链接：https://feishu.cn/meeting/xxx
会议 ID：xxx
时间：2025-06-18 15:00-17:00
点击链接即可加入会议"
