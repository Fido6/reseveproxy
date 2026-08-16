/**
 * 反代 API 路由 — 捕获所有路径，依据环境变量配置进行转发或拒绝。
 *
 * 环境变量：
 *   TARGET  可选，上游目标地址（例如 https://api.aa.com）
 *           为空或未设置时，所有请求返回 204 No Content
 *   PATH    可选，白名单路径前缀（例如 /v1/completion）
 *           为空或未设置时，全局反代（所有请求转发到上游）
 *   PORT    可选，监听端口，默认 3000（Next.js 默认端口）
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
// 工具函数
// ============================================================

/** 判断是否允许访问该路径 */
function isAllowed(pathname: string): boolean {
  const allowedPath = process.env.PATH ?? "";
  if (allowedPath === "") return true; // 未设置白名单 → 全局放行

  const normalized = allowedPath.replace(/\/+$/, "");
  return pathname === normalized || pathname.startsWith(`${normalized}/`);
}

// ============================================================
// 响应辅助
// ============================================================

function forbidden(): Response {
  return new Response("403 Forbidden: 该路径不在白名单中\n", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

// ============================================================
// 代理请求处理
// ============================================================

export async function GET(request: Request) {
  return proxy(request);
}

export async function POST(request: Request) {
  return proxy(request);
}

export async function PUT(request: Request) {
  return proxy(request);
}

export async function DELETE(request: Request) {
  return proxy(request);
}

export async function PATCH(request: Request) {
  return proxy(request);
}

export async function HEAD(request: Request) {
  return proxy(request);
}

export async function OPTIONS(request: Request) {
  return proxy(request);
}

async function proxy(request: Request): Promise<Response> {
  const target = process.env.TARGET ?? "";

  // TARGET 为空 → 204
  if (target === "") {
    return noContent();
  }

  const url = new URL(request.url);
  const pathname = url.pathname;
  const search = url.search;

  // 白名单校验
  if (!isAllowed(pathname)) {
    console.warn(`[403] 拒绝访问：${pathname}`);
    return forbidden();
  }

  // 构造上游 URL
  const upstreamUrl = new URL(`${target}${pathname}${search}`);

  // 复制请求头，修正 Host
  const headers = new Headers(request.headers);
  headers.set("host", upstreamUrl.host);

  // 转发请求体（GET/HEAD 不携带 body）
  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.blob();

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual" as RequestRedirect,
    });

    if (upstreamRes.status >= 500) {
      console.error(`[上游错误] ${upstreamRes.status} ${upstreamRes.statusText} (${upstreamUrl})`);
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: upstreamRes.headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[转发失败] ${upstreamUrl}：${message}`);
    return new Response("502 Bad Gateway: 无法连接到上游服务\n", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}