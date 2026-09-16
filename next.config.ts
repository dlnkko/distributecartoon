import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf", "mammoth"],
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
