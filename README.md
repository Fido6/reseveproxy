# Reverse Proxy — Next.js 实现

基于 Next.js 15 App Router 构建的反向代理，使用 Catch-all 路由 `[[...path]]` 捕获所有 HTTP 请求并转发到上游。

## 三种模式

| `TARGET` | `PATH` | 行为 |
|----------|--------|------|
| 未设置 / 空 | 任意 | 所有请求返回 `204 No Content`（空响应模式） |
| 已设置 | 未设置 / 空 | 所有请求转发到上游（全局反代模式） |
| 已设置 | 已设置 | 仅白名单路径转发，其余返回 `403 Forbidden`（白名单模式） |

## 环境变量

| 变量     | 必填 | 说明                                          | 默认值     | 示例                  |
| -------- | ---- | --------------------------------------------- | ---------- | --------------------- |
| `TARGET` | 否   | 上游目标地址                                  | —          | `https://api.aa.com`  |
| `PATH`   | 否   | 白名单路径前缀                                | —          | `/v1/completion`      |
| `PORT`   | 否   | 监听端口                                      | `3000`     | `3000`                |

## 运行

### 开发

```bash
npm install
npm run dev
```

### 生产

```bash
npm run build
npm start
```

### 设置环境变量

**Windows PowerShell：**
```powershell
$env:TARGET="https://api.aa.com"
$env:PATH="/v1/completion"
npm run dev
```

**Linux / macOS：**
```bash
TARGET=https://api.aa.com PATH=/v1/completion npm run dev
```

## 路由说明

使用 Next.js 15 App Router 的 **Catch-all 可选路由** [`app/[[...path]]/route.ts`](app/[[...path]]/route.ts) 捕获所有路径（包括 `/`）。核心逻辑：

- **[`isAllowed`](app/[[...path]]/route.ts:21)** — 白名单校验，路径精确匹配 `PATH` 或以 `PATH/` 开头才放行
- **[`proxy`](app/[[...path]]/route.ts:76)** — 转发逻辑，构造上游 URL、复制请求头、修正 Host、透传 body
- **[`forbidden`](app/[[...path]]/route.ts:30)** — 返回 `403 Forbidden`
- **[`noContent`](app/[[...path]]/route.ts:36)** — 返回 `204 No Content`

## 部署

支持部署到任何支持 Node.js 的 PaaS 平台（Vercel、Railway、Fly.io 等）。

### Vercel

1. 推送项目到 GitHub 仓库
2. 在 [Vercel Dashboard](https://vercel.com) 导入该仓库
3. **Build command** 留空（使用默认的 `next build`）
4. 在 **Environment Variables** 中添加 `TARGET` / `PATH`（可选 `PORT`）
5. 点击 **Deploy**

### 其他平台

遵循对应平台的 Next.js 部署指南，确保设置好环境变量即可。

## 访问规则

以 `TARGET=https://api.aa.com`、`PATH=/v1/completion` 为例：

| 请求路径                       | 结果                    | 转发到上游                        |
| ------------------------------ | ----------------------- | --------------------------------- |
| `/v1/completion`               | `200` 转发              | `https://api.aa.com/v1/completion` |
| `/v1/completion/chat`          | `200` 转发              | `https://api.aa.com/v1/completion/chat` |
| `/v1/completion?q=1`           | `200` 转发              | `https://api.aa.com/v1/completion?q=1` |
| `/`                            | `403 Forbidden`         | —                                 |
| `/v2/completion`               | `403 Forbidden`         | —                                 |
| `/v1/completionx`              | `403 Forbidden`         | —                                 |
| `/v1/completion/`（末尾斜杠）  | `403 Forbidden`         | —                                 |