import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 允许 better-sqlite3 等原生模块在 server 端使用
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
