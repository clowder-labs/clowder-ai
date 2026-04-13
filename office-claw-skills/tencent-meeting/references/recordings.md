# 录制与转写指南

## 查询录制列表

### 查询所有录制

```bash
python scripts/meeting.py recordings
```

### 查询指定会议的录制

```bash
python scripts/meeting.py recordings --meeting-id <会议ID>
```

### 返回结果

```json
{
  "success": true,
  "recordings": [
    {
      "record_file_id": "xxx",
      "meeting_subject": "项目周会",
      "start_time": "2026-04-01 15:00",
      "duration": 3600,
      "download_url": "https://..."
    }
  ]
}
```

---

## 获取转写内容

```bash
python scripts/meeting.py transcript --record-file-id <录制文件ID>
```

### 返回结果

```json
{
  "success": true,
  "transcript": {
    "segments": [
      {
        "speaker": "张三",
        "text": "大家好，我们开始今天的会议",
        "start_time": 0,
        "end_time": 3
      }
    ]
  }
}
```

---

## Python 调用示例

```python
from scripts.meeting import get_recordings, get_transcript

# 获取录制列表
recordings = get_recordings()
for rec in recordings['recordings']:
    print(f"{rec['meeting_subject']} - {rec['start_time']}")

# 获取转写内容
transcript = get_transcript(record_file_id="xxx")
for seg in transcript['transcript']['segments']:
    print(f"[{seg['speaker']}]: {seg['text']}")
```

---

## 注意事项

1. **权限要求**：需要会议主持人或管理员权限
2. **录制延迟**：会议结束后可能需要几分钟才能查询到录制
3. **转写质量**：取决于会议音频质量和发言人清晰度