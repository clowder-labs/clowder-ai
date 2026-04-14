---
name: email-manager
description: |
  邮件管理工具。支持发送邮件、查收邮件、回复邮件、标记邮件。
  兼容 QQ邮箱、Gmail、163邮箱、Outlook 等主流邮箱服务。
  
  触发场景：
  - 用户说"发邮件"、"发送邮件"、"帮我写封邮件"
  - 用户说"查邮件"、"查看邮件"、"有没有新邮件"
  - 用户说"回复邮件"、"回复某某的邮件"
  - 用户说"标记已读"、"标记未读"、"标星"
  - 用户提及邮箱、邮件相关操作
  
  关键词：邮件、发邮件、收邮件、查邮件、回复、已读、未读、标星、QQ邮箱、Gmail、163邮箱、附件。
---

# 邮件管理

统一邮件管理工具，通过 IMAP/SMTP 协议收发邮件。支持多邮箱配置。

## 快速开始

### 1. 配置邮箱

首次使用需配置邮箱账号。详见 [references/setup.md](references/setup.md)。

### 2. 常用操作

**发送邮件：**
```bash
python scripts/smtp_sender.py send --to "收件人@example.com" --subject "主题" --body "正文"
```

**查收邮件：**
```bash
python scripts/imap_reader.py list --limit 10
```

**回复邮件：**
```bash
python scripts/imap_reader.py reply --id <邮件ID> --body "回复内容"
```

**标记邮件：**
```bash
python scripts/imap_reader.py mark --id <邮件ID> --action read    # 标记已读
python scripts/imap_reader.py mark --id <邮件ID> --action unread  # 标记未读
python scripts/imap_reader.py mark --id <邮件ID> --action star    # 标星
```

## 支持的邮箱服务

| 邮箱 | IMAP 服务器 | SMTP 服务器 |
|------|------------|-------------|
| QQ邮箱 | imap.qq.com:993 | smtp.qq.com:587 |
| Gmail | imap.gmail.com:993 | smtp.gmail.com:587 |
| 163邮箱 | imap.163.com:993 | smtp.163.com:465 |
| Outlook | outlook.office365.com:993 | smtp.office365.com:587 |

## 详细文档

- **邮箱配置**：[references/setup.md](references/setup.md)
- **发送邮件**：[references/send.md](references/send.md)
- **收件功能**：[references/receive.md](references/receive.md)
- **多账号管理**：[references/accounts.md](references/accounts.md)