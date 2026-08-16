# Deno 反向代理

一个基于 Deno 原生 API（[`Deno.serve`](https://docs.deno.com/api/web/。#deno-serve) 与现代 Web 标准 `Request` / `Response` / `fetch`）实现的轻量反向代理。

支持三种模式（由环境变量组合决定）：

1. **空响应模式**：`TARGET` 为空或未设置 → 所有请求直接返回 `204 No Content`。
2. **全局反代模式**：`TARGET` 已设置，但 `PATH` 为空或未设置 → 所有请求转发到上游。
3. **白名单模式**：`TARGET` 与 `PATH` 均已设置 → 仅放行白名单路径，其余路径返回 `403 Forbidden`。

## 环境变量

| 变量     | 必填 | 说明                                                                 | 示例                  |
| -------- | ---- | -------------------------------------------------------------------- | --------------------- |
| `TARGET` | 否   | 上游目标地址；为空或未设置时返回 204                                  | `https://api.aa.com`  |
| `PATH`   | 否   | 白名单路径；为空或未设置时全局反代                                    | `/v1/completion`      |
| `PORT`   | 否   | 监听端口，默认 `8000`                                                | `8000`                |

> 注意：Windows CMD / PowerShell 与 Linux/macOS 中设置环境变量的语法不同，请按所用终端设置。

## 运行

### Linux / macOS (bash/zsh)

```bash
# 白名单模式
TARGET=https://api.aa.com PATH=/v1/completion deno run --allow-env --allow-net main.ts

# 全局反代模式
TARGET=https://api.aa.com deno run --allow-env --allow-net main.ts

# 空响应模式（不设任何变量）
PORT=8000 deno run --allow-env --allow-net main.ts
```

### Windows PowerShell

```powershell
$env:TARGET="https://api.aa.com"
$env:PATH="/v1/completion"
deno run --allow-env --allow-net main.ts
```

### 使用 Deno 任务（配置文件已内置命令参数）

```bash
deno task start
```

配合 `.env` 文件使用（需 [deno_env](https://docs.deno.com/runtime/reference/cli/scripts/#deno_env) 支持）：

```bash
deno task dev
```

## 部署

### Deno Deploy

项目已通过 [`deno.json`](deno.json) 的 `deploy.entryPoints` 声明入口点为 `./main.ts`，以下是部署步骤：

1. 将项目推送至 GitHub 仓库
2. 在 [Deno Deploy Dashboard](https://dash.deno.com) 点击 **New Project**
3. 选择 **Deploy from GitHub repository**，关联你的仓库
4. 在部署设置中，**Build command 留空**（Deno 项目无需构建步骤）
5. 在 **Environment Variables** 中添加：
   - `TARGET` → `https://api.aa.com`（或你的上游地址）
   - `PATH` → `/v1/completion`（或你的白名单路径，留空则全局反代）
   - `PORT` → `8000`（可选，Deploy 默认会处理端口）
6. 点击 **Deploy Project**

> **关键**：Deno Deploy 会自动处理 TypeScript 编译，**不需要也不应该设置 Build command**。如果 dashboard 中显示 Build command 为必填项，请将其留空或设为 `echo "skip"`。部署后，`deploy.entryPoints` 告诉 Deploy 哪个文件是入口。

### 其他 PaaS（需要 Build command 的平台）

若平台强制要求填写 Build command，可填入无害的空命令：

```bash
echo "no build needed"
```

> 注意：平台通常是先执行 Build command，再执行 `deno task start` 或平台指定的 Start command 启动服务。请同时在平台环境变量中配置 `TARGET` / `PATH`（可选 `PORT`）。

## 访问规则

### 白名单模式（`TARGET=https://api.aa.com`，`PATH=/v1/completion`）

| 请求路径                       | 结果                    | 转发到上游                        |
| ------------------------------ | ----------------------- | --------------------------------- |
| `/v1/completion`               | `200` 转发              | `https://api.aa.com/v1/completion` |
| `/v1/completion/chat`          | `200` 转发              | `https://api.aa.com/v1/completion/chat` |
| `/v1/completion?q=1`           | `200` 转发              | `https://api.aa.com/v1/completion?q=1` |
| `/`                            | `403 Forbidden`         | —                                 |
| `/v2/completion`               | `403 Forbidden`         | —                                 |
| `/v1/completionx`              | `403 Forbidden`         | —                                 |
| `/v1/completion/`（末尾斜杠）  | `403 Forbidden`         | —                                 |

> 路径开头补 `/` 以保持一致性：`/v1/completion` 尾部斜杠的写法会被拒绝；如需放行子路径，请使用 `/v1/completion/xxx` 形式。

### 全局反代模式（`TARGET=https://api.aa.com`，未设置 `PATH`）

所有 `GET/POST/PUT/DELETE` 等请求都会原样转发到 `https://api.aa.com`，路径与查询参数均透传。

### 空响应模式（未设置 `TARGET`）

不论访问什么路径，一律返回 `204 No Content`（无响应体）。

## 安全相关

- 本服务仅作示例用途，如需对外暴露，建议在代理前再加一层鉴权（Token / Basic Auth 等），以免白名单路径被滥用。
- 生产环境建议通过系统进程管理器（如 [pm2](https://pm2.keymetrics.io/)、supervisor 等）托管，保证崩溃后自动重启。
- 如需辅助设置系统环境变量，Windows 可使用 `setx`，macOS 可使用 `launchctl setenv`，Linux 可在 shell 配置文件中 export。

## 故障排查

- **启动时报缺少环境变量**：确认已按所需模式设置 `TARGET` / `PATH`。
- **`deno task start` 报权限错误**：确认执行的是 `deno task start`（项目内已配置网络、环境变量权限）而非直接的 `deno run main.ts`。
- **上游 5xx / 连接超时**：检查 `TARGET` 是否可达、`TARGET` 是否包含多余的路径（建议只放域名），以及上游是否需要鉴权头。