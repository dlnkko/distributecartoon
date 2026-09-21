import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf", "mammoth", "ffmpeg-static"],
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
