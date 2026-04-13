# 飞书会议 API 参考

## 目录
- [API 概览](#api-概览)
- [认证方式](#认证方式)
- [创建会议 API](#创建会议-api)
- [请求参数](#请求参数)
- [响应参数](#响应参数)
- [错误码](#错误码)
- [使用示例](#使用示例)

## API 概览

本参考文档提供飞书开放平台会议 API 的关键信息，用于创建在线会议。

**API 基础信息：**
- 接口地址：`https://open.feishu.cn/open-apis/vc/v1/meetings`
- 请求方法：POST
- 认证方式：OAuth 2.0
- 内容类型：application/json

## 认证方式

### OAuth 2.0 授权

飞书 API 使用 OAuth 2.0 进行身份验证。需要在请求头中包含 access_token：

```
Authorization: Bearer {access_token}
```

**授权端点：**
- 授权 URL：`https://open.feishu.cn/open-apis/authen/v1/authorize`
- 令牌 URL：`https://open.feishu.cn/open-apis/authen/v1/oidc/access_token`

**所需权限：**
- `meeting:meeting:write` - 创建和编辑会议

## 创建会议 API

### 请求格式

**请求 URL：**
```
POST https://open.feishu.cn/open-apis/vc/v1/meetings
```

**请求头：**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| topic | string | 是 | 会议主题，长度不超过 200 字符 |
| start_time | string | 是 | 会议开始时间，ISO 8601 格式，例如：`2025-06-18T14:00:00+08:00` |
| end_time | string | 是 | 会议结束时间，ISO 8601 格式 |
| user_ids | array | 否 | 参与人 user_id 列表，最多支持 500 人 |
| description | string | 否 | 会议描述，长度不超过 1000 字符 |

**参数验证规则：**
1. `start_time` 必须早于 `end_time`
2. `start_time` 不能早于当前时间
3. 会议时长建议不超过 24 小时
4. `topic` 不能为空

### 响应参数

成功响应（HTTP 200）：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "meeting_id": "1234567890",
    "meeting_url": "https://feishu.cn/meeting/xxxxxxxx",
    "meeting_code": "123456",
    "start_time": "2025-06-18T14:00:00+08:00",
    "end_time": "2025-06-18T15:00:00+08:00"
  }
}
```

**字段说明：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| code | int | 错误码，0 表示成功 |
| msg | string | 错误描述 |
| meeting_id | string | 会议唯一标识 |
| meeting_url | string | 会议链接，可分享给参会者 |
| meeting_code | string | 会议号 |
| start_time | string | 实际会议开始时间 |
| end_time | string | 实际会议结束时间 |

## 错误码

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| 0 | 成功 | - |
| 99991663 | 无权限 | 检查应用是否已授予 `meeting:meeting:write` 权限 |
| 99991401 | 参数错误 | 检查请求参数格式和值 |
| 99991402 | token 无效 | 重新获取 access_token |
| 99991403 | 会议主题过长 | 缩短会议主题至 200 字符以内 |
| 99991404 | 时间格式错误 | 使用 ISO 8601 格式，例如：`2025-06-18T14:00:00+08:00` |
| 99991405 | 开始时间晚于结束时间 | 调整开始和结束时间 |
| 99991406 | 会议时长超限 | 缩短会议时长至 24 小时以内 |
| 99991601 | 用户不存在 | 检查 user_id 是否正确 |
| 99991602 | 参与人数量超限 | 减少参与人数量至 500 人以内 |

**错误响应示例：**

```json
{
  "code": 99991663,
  "msg": "无权限"
}
```

## 使用示例

### Python 请求示例

```python
import requests

url = "https://open.feishu.cn/open-apis/vc/v1/meetings"
headers = {
    "Authorization": "Bearer YOUR_ACCESS_TOKEN",
    "Content-Type": "application/json"
}
body = {
    "topic": "产品评审会",
    "start_time": "2025-06-18T14:00:00+08:00",
    "end_time": "2025-06-18T15:00:00+08:00",
    "user_ids": ["ou_xxx", "ou_yyy"],
    "description": "评审产品需求和设计方案"
}

response = requests.post(url, headers=headers, json=body)
data = response.json()

if data["code"] == 0:
    print(f"会议创建成功: {data['data']['meeting_url']}")
else:
    print(f"创建失败: {data['msg']}")
```

### cURL 请求示例

```bash
curl -X POST 'https://open.feishu.cn/open-apis/vc/v1/meetings' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "topic": "产品评审会",
    "start_time": "2025-06-18T14:00:00+08:00",
    "end_time": "2025-06-18T15:00:00+08:00"
  }'
```

## 注意事项

1. **时区处理**：时间参数必须包含时区信息，建议使用 `+08:00` 表示北京时间
2. **会议链接**：创建成功后，`meeting_url` 可直接分享给参会者
3. **用户 ID 获取**：`user_id` 可通过飞书用户管理 API 获取，格式通常为 `ou_xxx`
4. **权限配置**：确保应用已授予必要的权限，否则会返回无权限错误
5. **频率限制**：API 调用有频率限制，避免短时间内大量调用

## 相关资源

- [飞书开放平台文档](https://open.feishu.cn/document/ukTMukTMukTM/uEjNwUjLxYDM14SM2ATN)
- [会议 API 完整文档](https://open.feishu.cn/document/ukTMukTMukTM/uEjNwUjLxYDM14SM2ATN)
- [OAuth 2.0 授权指南](https://open.feishu.cn/document/ukTMukTMukTM/uEjNwUjLxYDM14SM2ATN)
