import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default is 1MB, too small for a real phone-camera employee photo.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
