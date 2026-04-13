# 发送邮件详细指南

## 基本发送

### 发送纯文本邮件

```bash
python scripts/smtp_sender.py send \
  --to "收件人@example.com" \
  --subject "邮件主题" \
  --body "邮件正文内容"
```

### 发送 HTML 邮件

```bash
python scripts/smtp_sender.py send \
  --to "收件人@example.com" \
  --subject "邮件主题" \
  --body "<h1>标题</h1><p>HTML 内容</p>" \
  --html
```

### 发送带附件的邮件

```bash
python scripts/smtp_sender.py send \
  --to "收件人@example.com" \
  --subject "带附件的邮件" \
  --body "请查收附件" \
  --attach "/path/to/file1.pdf" \
  --attach "/path/to/file2.xlsx"
```

### 抄送和密送

```bash
python scripts/smtp_sender.py send \
  --to "主收件人@example.com" \
  --cc "抄送人@example.com" \
  --bcc "密送人@example.com" \
  --subject "主题" \
  --body "正文"
```

---

## HTML 邮件模板

### 简单通知邮件

```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1a73e8;">通知标题</h2>
  <p>这是通知内容</p>
  <hr>
  <p style="color: #888; font-size: 12px;">此邮件由系统自动发送</p>
</div>
```

### 会议邀请邮件

```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
  <div style="background: #1a73e8; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h2>📅 会议邀请</h2>
  </div>
  <div style="padding: 20px;">
    <p><strong>主题：</strong>会议主题</p>
    <p><strong>时间：</strong>2026-04-03 14:00</p>
    <p><strong>地点：</strong>会议室</p>
    <a href="会议链接" style="display: inline-block; background: #1a73e8; color: white; padding: 10px 20px; border-radius: 5px; text-decoration: none;">加入会议</a>
  </div>
</div>
```

---

## Python 调用示例

```python
from scripts.smtp_sender import send_email

# 发送简单邮件
result = send_email(
    to="收件人@example.com",
    subject="测试邮件",
    body="这是测试内容"
)

# 发送 HTML 邮件
result = send_email(
    to="收件人@example.com",
    subject="HTML 邮件",
    body="<h1>标题</h1><p>内容</p>",
    html=True
)

# 发送带附件的邮件
result = send_email(
    to="收件人@example.com",
    subject="带附件",
    body="请查收",
    attachments=["/path/to/file.pdf"]
)

print(result)
```

---

## 常见问题

### 发送失败：535 Authentication failed

**原因：** 授权码错误或未开启 SMTP 服务

**解决：** 重新获取授权码

### 发送失败：连接超时

**原因：** 网络问题或防火墙拦截

**解决：** 检查网络，确认端口未被封锁

### 中文乱码

**解决：** 确保使用 `--html` 参数发送 HTML 邮件，并设置 UTF-8 编码