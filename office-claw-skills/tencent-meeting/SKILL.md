---
name: tencent-meeting
description: |
  腾讯会议管理工具。支持创建会议、查询会议、取消会议、查询录制等操作。
  
  触发场景：
  - 用户说"创建会议"、"预约会议"、"帮我定个会议"
  - 用户说"查询会议"、"我的会议列表"、"会议详情"
  - 用户说"取消会议"、"删除会议"
  - 用户说"会议录制"、"录制回放"
  
  关键词：会议、腾讯会议、预约、创建会议、会议号、参会、录制、转写。
---

# 腾讯会议管理

通过腾讯会议 API 管理会议，支持跨平台使用。

## 快速开始

### 1. 获取 Token

访问 https://meeting.tencent.com/ai-skill 获取个人 Token

### 2. 配置

创建 `config.json` 并填入 Token：
```json
{
  "token": "你的Token"
}
```

### 3. 常用操作

**创建会议：**
```bash
python scripts/meeting.py create --subject "会议主题" --start "2026-04-03 15:00"
```

**查询会议：**
```bash
python scripts/meeting.py list
```

**取消会议：**
```bash
python scripts/meeting.py cancel --meeting-id <会议ID>
```

## 详细文档

- **API 配置**：[references/setup.md](references/setup.md)
- **会议管理**：[references/meeting.md](references/meeting.md)
- **录制与转写**：[references/recordings.md](references/recordings.md)