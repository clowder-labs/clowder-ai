# 会议管理详细指南

## 创建会议

### 基本创建

```bash
python scripts/meeting.py create \
  --subject "项目周会" \
  --start "2026-04-03 15:00"
```

默认会议时长 60 分钟。

### 指定时长

```bash
python scripts/meeting.py create \
  --subject "产品评审" \
  --start "2026-04-03 14:00" \
  --duration 120
```

### 返回结果

```json
{
  "success": true,
  "meeting": {
    "subject": "项目周会",
    "meeting_code": "123456789",
    "join_url": "https://meeting.tencent.com/dm/xxxxxx",
    "start_time": "2026-04-03 15:00",
    "duration": 60
  }
}
```

---

## 查询会议

### 查询会议列表

```bash
python scripts/meeting.py list
```

返回即将开始的会议列表。

### 查询会议详情

```bash
python scripts/meeting.py get --meeting-id <会议ID>
```

---

## 取消会议

```bash
python scripts/meeting.py cancel --meeting-id <会议ID>
```

---

## 时间格式

所有时间使用 `YYYY-MM-DD HH:MM` 格式，例如：

- `2026-04-03 15:00`
- `2026-04-03 09:30`

---

## Python 调用示例

```python
from scripts.meeting import create_meeting, list_meetings, cancel_meeting

# 创建会议
result = create_meeting(
    subject="团队周会",
    start_time="2026-04-03 15:00",
    duration=60
)
print(result)

# 查询会议
meetings = list_meetings()
for m in meetings['meetings']:
    print(f"{m['subject']} - {m['meeting_code']}")

# 取消会议
cancel_meeting(meeting_id="xxx")
```

---

## 常见问题

### 创建失败：Token 无效

检查 Token 是否正确配置，或重新获取 Token。

### 时间格式错误

确保使用 `YYYY-MM-DD HH:MM` 格式，注意空格。

### 网络超时

检查网络连接，确认能访问 `meeting.tencent.com`。