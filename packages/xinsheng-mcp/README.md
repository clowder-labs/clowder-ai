# Xinsheng Search MCP

一个本地 `stdio` MCP server，用持久化 Chrome profile 访问华为心声社区搜索页：

- 搜索页：`https://xinsheng.huawei.com/next/plus/#/search`
- 登录态：通过浏览器 profile 目录持久化，后续搜索复用同一份 cookie/session
- 适用场景：当前外网先完成开发，后续搬到公司内网后在同一 profile 下登录即可继续使用

## 工具

- `xinsheng_prepare_session`
  - 打开一个可见浏览器窗口，进入搜索页并保留 profile
  - 适合首次登录、补登录、验证当前 session 是否可用
- `xinsheng_search`
  - 直接打开搜索路由并抽取结果卡片
  - 如果尚未登录，会返回明确提示并建议先调用 `xinsheng_prepare_session`

## 环境变量

- `XINSHENG_BROWSER_EXECUTABLE_PATH`
  - 可选。Chrome / Edge 可执行文件路径
- `XINSHENG_PROFILE_DIR`
  - 可选。持久化浏览器 profile 目录
- `XINSHENG_HOME_URL`
  - 默认：`https://xinsheng.huawei.com/next/index/#/home`
- `XINSHENG_SEARCH_PAGE_URL`
  - 默认：`https://xinsheng.huawei.com/next/plus/#/search`
- `XINSHENG_DEFAULT_VISIBLE`
  - 默认：`false`
- `XINSHENG_NAVIGATION_TIMEOUT_MS`
  - 默认：`60000`

## 本地运行

```bash
pnpm --filter @cat-cafe/xinsheng-mcp build
pnpm --filter @cat-cafe/xinsheng-mcp start
```

## MCP 配置示例

```json
{
  "mcpServers": {
    "xinsheng-search": {
      "command": "pnpm",
      "args": ["--dir", "/ABS/PATH/TO/clowder-ai", "--filter", "@cat-cafe/xinsheng-mcp", "start"],
      "env": {
        "XINSHENG_BROWSER_EXECUTABLE_PATH": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      }
    }
  }
}
```
