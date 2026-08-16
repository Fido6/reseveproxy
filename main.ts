/**
 * 反代服务：
 *   - TARGET 为空或未设置时，所有请求直接返回 204 No Content；
 *   - 设置了 TARGET 但 PATH 为空或未设置时，全局反代（所有请求转发到上游）；
 *   - 同时设置了 TARGET 与 PATH 时，仅白名单路径转发，其他路径返回 403。
 *
 * 环境变量：
 *   TARGET  可选，上游目标地址，例如 https://api.aa.com（为空则全部返回 204）
 *   PATH    可选，白名单路径，例如 /v1/completion（为空则全局反代）
 *   PORT    可选，监听端口，默认 8000
 */

const TARGET = Deno.env.get("TARGET") ?? "";
const ALLOWED_PATH = Deno.env.get("PATH") ?? "";
const PORT = Number(Deno.env.get("PORT") ?? "8000");

// 是否配置了上游目标
const hasTarget = TARGET !== "";
// 是否设置了白名单路径
const hasAllowedPath = ALLOWED_PATH !== "";

if (hasTarget) {
  if (hasAllowedPath) {
    // 规范化白名单路径：去除末尾斜杠，避免 /v1/completion/ 与 /v1/completion 被当作两个路径
    const normalizedAllowedPath = ALLOWED_PATH.replace(/\/+$/, "");
    const allowedPrefix = `${normalizedAllowedPath}/`;
    console.log(`已启用白名单：仅转发 ${normalizedAllowedPath} 及其子路径`);
  } else {
    console.log("已启用全局反代：所有请求转发到上游");
  }
  console.log(`反向代理已启动：本机 :${PORT}  ->  ${TARGET}`);
} else {
  console.log(`未配置 TARGET：启动空响应模式（所有请求返回 204），监听 :${PORT}`);
}

function isAllowed(rawUrl: URL): boolean {
  // 未设置白名单路径时视为全局放行
  if (!hasAllowedPath) return true;
  // 规范化白名单路径（去除末尾斜杠）
  const normalizedAllowedPath = ALLOWED_PATH.replace(/\/+$/, "");
  const pathname = rawUrl.pathname;
  return pathname === normalizedAllowedPath || pathname.startsWith(`${normalizedAllowedPath}/`);
}

function forbidden(): Response {
  return new Response("403 Forbidden: 该路径不在白名单中\n", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

async function proxy(req: Request): Promise<Response> {
  // TARGET 为空或未设置：所有请求返回 204 No Content
  if (!hasTarget) {
    return noContent();
  }

  const incomingUrl = new URL(req.url);

  if (!isAllowed(incomingUrl)) {
    console.warn(`拒绝访问：${incomingUrl.pathname}`);
    return forbidden();
  }

  // 构造上游地址：保留原始路径（含查询参数），路径会原样传回上游
  const targetUrl = new URL(`${TARGET}${incomingUrl.pathname}${incomingUrl.search}`);

  // 复制原始请求头，并修正 Host 头为上游主机名，避免上游因 Host 不匹配而报错
  const headers = new Headers(req.headers);
  headers.set("host", targetUrl.host);

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
      redirect: "manual",
    });

    if (upstreamResponse.status >= 500) {
      console.error(`上游错误: ${upstreamResponse.status} ${upstreamResponse.statusText} (${targetUrl})`);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: upstreamResponse.headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`转发失败（${targetUrl}）：${message}`);
    return new Response("502 Bad Gateway: 无法连接到上游服务\n", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

// Deno 官方推荐的 HTTP 服务入口
Deno.serve({ port: PORT }, proxy);