# 邮箱配置指南

## 一、获取授权码

不同邮箱获取授权码的方式不同：

### QQ 邮箱

1. 登录 [QQ 邮箱](https://mail.qq.com)
2. 点击 **设置** → **账户**
3. 找到 **POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV服务**
4. 开启 **IMAP/SMTP 服务**
5. 手机验证后生成 **授权码**（16位字符）
6. 保存授权码（只显示一次）

### Gmail

1. 登录 Google 账户
2. 开启 **两步验证**
3. 进入 **账户设置** → **安全** → **应用专用密码**
4. 生成应用专用密码

### 163 邮箱

1. 登录 [163 邮箱](https://mail.163.com)
2. 点击 **设置** → **POP3/SMTP/IMAP**
3. 开启 **IMAP/SMTP 服务**
4. 获取 **授权码**

---

## 二、服务器配置

| 邮箱 | IMAP 服务器 | IMAP 端口 | SMTP 服务器 | SMTP 端口 |
|------|------------|----------|------------|----------|
| QQ邮箱 | imap.qq.com | 993 | smtp.qq.com | 587 |
| Gmail | imap.gmail.com | 993 | smtp.gmail.com | 587 |
| 163邮箱 | imap.163.com | 993 | smtp.163.com | 465 |
| Outlook | outlook.office365.com | 993 | smtp.office365.com | 587 |

---

## 三、创建配置文件

在 Skill 目录下创建 `config.json`：

```json
{
  "imap_host": "imap.qq.com",
  "imap_port": 993,
  "imap_user": "你的邮箱@qq.com",
  "imap_pass": "授权码",
  
  "smtp_host": "smtp.qq.com",
  "smtp_port": 587,
  "smtp_user": "你的邮箱@qq.com",
  "smtp_pass": "授权码",
  "smtp_from": "你的邮箱@qq.com"
}
```

---

## 四、环境变量方式（可选）

也可以通过环境变量配置：

```bash
# IMAP
export IMAP_HOST=imap.qq.com
export IMAP_PORT=993
export IMAP_USER=你的邮箱@qq.com
export IMAP_PASS=授权码

# SMTP
export SMTP_HOST=smtp.qq.com
export SMTP_PORT=587
export SMTP_USER=你的邮箱@qq.com
export SMTP_PASS=授权码
export SMTP_FROM=你的邮箱@qq.com
```

---

## 五、测试连接

```bash
# 测试 SMTP 发送
python scripts/smtp_sender.py test

# 测试 IMAP 读取
python scripts/imap_reader.py list --limit 1
```

如果返回 `success: true`，说明配置成功。