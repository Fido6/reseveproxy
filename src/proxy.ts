import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// ── Reverse proxy via Next.js 16 "proxy" file convention ──────────────────
// Env vars:
//   TARGET        - Upstream base URL, e.g. "https://api.aa.com"
//   PROXY_PATHS   - Comma-separated whitelist paths (exact match)
//                    e.g. "/v1/completion,/v1/chat/completions"
//
// Behavior:
//   TARGET empty/missing  → return 204
//   PROXY_PATHS empty/missing → global proxy (all requests forwarded)
//   PROXY_PATHS set       → only listed paths forwarded; others get 403

const targetOrigin = (process.env.TARGET || "").trim();
const rawPaths = (process.env.PROXY_PATHS || "").trim();

const whitelistPaths = rawPaths
  ? rawPaths.split(",").map((p) => p.trim()).filter(Boolean)
  : [];

const isGlobalProxy = whitelistPaths.length === 0 && targetOrigin.length > 0;

export async function proxy(request: NextRequest) {
  // ── No TARGET: nothing to proxy ────────────────────────────────────────
  if (!targetOrigin) {
    return new NextResponse(null, { status: 204 });
  }

  const upstreamBase = targetOrigin.endsWith("/")
    ? targetOrigin
    : targetOrigin + "/";

  const pathname = request.nextUrl.pathname;
  const searchParams = request.nextUrl.searchParams.toString();
  const queryString = searchParams ? `?${searchParams}` : "";

  // ── PROXY_PATHS set: exact-match whitelist check ──────────────────────
  if (!isGlobalProxy) {
    if (!whitelistPaths.includes(pathname)) {
      return new NextResponse("403 Forbidden: path not in whitelist", {
        status: 403,
        headers: { "content-type": "text/plain" },
      });
    }
  }

  // ── Build upstream URL ─────────────────────────────────────────────────
  const upstreamUrl = `${upstreamBase}${pathname.replace(/^\//, "")}${queryString}`;

  // ── Read request body ──────────────────────────────────────────────────
  let forwardedBody: BodyInit | null = null;
  const method = request.method.toUpperCase();

  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    try {
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > 0) {
        forwardedBody = new Blob([bytes]);
      }
    } catch {
      // proceed without body
    }
  }

  // ── Build forwarded headers ────────────────────────────────────────────
  const forwardedHeaders = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (key.toLowerCase() === "host") {
      continue;
    }
    forwardedHeaders.set(key, value);
  }

  forwardedHeaders.set("x-forwarded-host", request.headers.get("host") || "");
  forwardedHeaders.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));

  // ── Forward to upstream ────────────────────────────────────────────────
  try {
    const upstreamResp = await fetch(upstreamUrl, {
      method,
      headers: forwardedHeaders,
      body: forwardedBody,
      redirect: "manual",
    });

    const respHeaders: Record<string, string> = {};
    for (const [key, value] of upstreamResp.headers.entries()) {
      if (
        key.toLowerCase() === "transfer-encoding" ||
        key.toLowerCase() === "connection"
      ) {
        continue;
      }
      respHeaders[key] = value;
    }

    let bodyText = "";
    try {
      bodyText = await upstreamResp.text();
    } catch {
      bodyText = "";
    }

    return new NextResponse(bodyText, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: respHeaders,
    });
  } catch {
    return new NextResponse("Upstream fetch failed", {
      status: 502,
      headers: { "content-type": "text/plain" },
    });
  }
}

export const config = {
  matcher: ["/"],
};
