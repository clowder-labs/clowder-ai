# 多账号管理

## 配置多个邮箱账号

### 方式一：多个配置文件

为每个邮箱创建独立配置文件：

```
email-manager/
├── config.qq.json      ← QQ 邮箱配置
├── config.gmail.json   ← Gmail 配置
└── config.163.json     ← 163 邮箱配置
```

使用时指定配置文件：

```bash
# 使用 QQ 邮箱发送
python scripts/smtp_sender.py send --config config.qq.json --to ...

# 使用 Gmail 发送
python scripts/smtp_sender.py send --config config.gmail.json --to ...
```

### 方式二：统一配置文件

```json
{
  "accounts": {
    "qq": {
      "imap_host": "imap.qq.com",
      "imap_port": 993,
      "imap_user": "xxx@qq.com",
      "imap_pass": "授权码",
      "smtp_host": "smtp.qq.com",
      "smtp_port": 587
    },
    "gmail": {
      "imap_host": "imap.gmail.com",
      "imap_port": 993,
      "imap_user": "xxx@gmail.com",
      "imap_pass": "应用密码",
      "smtp_host": "smtp.gmail.com",
      "smtp_port": 587
    }
  },
  "default": "qq"
}
```

---

## 使用指定账号

```bash
# 使用默认账号
python scripts/smtp_sender.py send --to ...

# 使用指定账号（需修改脚本支持 --account 参数）
python scripts/smtp_sender.py send --account gmail --to ...
```

---

## 账号切换示例（Python）

```python
import json

def get_account_config(account_name):
    with open('config.json') as f:
        config = json.load(f)
    return config['accounts'][account_name]

# 使用 QQ 邮箱
qq_config = get_account_config('qq')

# 使用 Gmail
gmail_config = get_account_config('gmail')
```

---

## 常见配置模板

### QQ 邮箱

```json
{
  "imap_host": "imap.qq.com",
  "imap_port": 993,
  "imap_user": "QQ号@qq.com",
  "imap_pass": "16位授权码",
  "smtp_host": "smtp.qq.com",
  "smtp_port": 587,
  "smtp_user": "QQ号@qq.com",
  "smtp_pass": "16位授权码"
}
```

### Gmail

```json
{
  "imap_host": "imap.gmail.com",
  "imap_port": 993,
  "imap_user": "xxx@gmail.com",
  "imap_pass": "应用专用密码",
  "smtp_host": "smtp.gmail.com",
  "smtp_port": 587,
  "smtp_user": "xxx@gmail.com",
  "smtp_pass": "应用专用密码"
}
```

### 163 邮箱

```json
{
  "imap_host": "imap.163.com",
  "imap_port": 993,
  "imap_user": "xxx@163.com",
  "imap_pass": "授权码",
  "smtp_host": "smtp.163.com",
  "smtp_port": 465,
  "smtp_user": "xxx@163.com",
  "smtp_pass": "授权码"
}
```

### Outlook

```json
{
  "imap_host": "outlook.office365.com",
  "imap_port": 993,
  "imap_user": "xxx@outlook.com",
  "imap_pass": "邮箱密码",
  "smtp_host": "smtp.office365.com",
  "smtp_port": 587,
  "smtp_user": "xxx@outlook.com",
  "smtp_pass": "邮箱密码"
}
```