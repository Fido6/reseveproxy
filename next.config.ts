import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 关闭 Next.js 默认的响应压缩，避免与上游冲突
  compress: false,
};

export default nextConfig;