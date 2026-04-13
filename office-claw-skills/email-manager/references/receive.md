# 收件功能详细指南

## 查看邮件列表

### 查看最新 10 封邮件

```bash
python scripts/imap_reader.py list --limit 10
```

### 仅查看未读邮件

```bash
python scripts/imap_reader.py list --unread
```

### 查看其他文件夹

```bash
# 已发送
python scripts/imap_reader.py list --folder "Sent"

# 草稿箱
python scripts/imap_reader.py list --folder "Drafts"

# 垃圾邮件
python scripts/imap_reader.py list --folder "Junk"
```

---

## 读取邮件详情

```bash
python scripts/imap_reader.py read --id <邮件ID>
```

返回内容包括：
- `subject`：邮件主题
- `from`：发件人
- `to`：收件人
- `date`：发送时间
- `body`：邮件正文

---

## 搜索邮件

### 按关键词搜索

```bash
python scripts/imap_reader.py search --query "发票"
```

### 搜索发件人

```bash
python scripts/imap_reader.py search --query "张三"
```

### 限制结果数量

```bash
python scripts/imap_reader.py search --query "会议" --limit 50
```

---

## 标记邮件

### 标记已读

```bash
python scripts/imap_reader.py mark --id <邮件ID> --action read
```

### 标记未读

```bash
python scripts/imap_reader.py mark --id <邮件ID> --action unread
```

### 标星

```bash
python scripts/imap_reader.py mark --id <邮件ID> --action star
```

### 取消标星

```bash
python scripts/imap_reader.py mark --id <邮件ID> --action unstar
```

---

## Python 调用示例

```python
from scripts.imap_reader import list_emails, read_email, search_emails, mark_email

# 获取邮件列表
result = list_emails(limit=10, unread_only=True)
for email in result['emails']:
    print(f"{email['subject']} - {email['from']}")

# 读取邮件详情
email = read_email(email_id='123')
print(email['email']['body'])

# 搜索邮件
results = search_emails(query='发票')
print(f"找到 {results['count']} 封邮件")

# 标记已读
mark_email(email_id='123', action='read')
```

---

## 常见文件夹名称

| 邮箱 | 收件箱 | 已发送 | 草稿 | 垃圾邮件 |
|------|-------|--------|------|---------|
| QQ邮箱 | INBOX | Sent | Drafts | Junk |
| Gmail | INBOX | [Gmail]/Sent Mail | [Gmail]/Drafts | [Gmail]/Spam |
| 163邮箱 | INBOX | Sent | Drafts | Junk |

---

## 注意事项

1. **邮件 ID** 在不同文件夹间不通用，操作时需指定正确的文件夹
2. **正文长度** 默认限制 5000 字符，避免内存溢出
3. **搜索功能** 依赖服务器支持，部分邮箱可能不支持中文搜索