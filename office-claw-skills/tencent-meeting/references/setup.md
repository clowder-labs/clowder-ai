# 腾讯会议 API 配置指南

## 一、获取 Token

1. 访问 https://meeting.tencent.com/ai-skill
2. 使用微信或手机号登录
3. 在页面中找到并复制你的个人 Token

> Token 用于 API 认证，请妥善保管，不要泄露给他人。

---

## 二、配置方式

### 方式一：配置文件（推荐）

在 Skill 目录下创建 `config.json`：

```json
{
  "token": "你的Token"
}
```

### 方式二：环境变量

```bash
# Linux / macOS
export TENCENT_MEETING_TOKEN="你的Token"

# Windows CMD
set TENCENT_MEETING_TOKEN=你的Token

# Windows PowerShell
$env:TENCENT_MEETING_TOKEN="你的Token"
```

---

## 三、验证配置

```bash
python scripts/meeting.py list
```

如果返回会议列表，说明配置成功。

---

## 四、安全提示

1. **不要提交 config.json 到 Git**（已添加到 .gitignore）
2. Token 具有账号权限，请勿分享
3. 如怀疑 Token 泄露，请重新生成