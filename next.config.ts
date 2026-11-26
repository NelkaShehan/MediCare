import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentUpgrade: "security",
  },
  async headers() {
    return [
      {
        // Force real file downloads for project archives.
        source: "/downloads/:path*",
        headers: [
          { key: "Content-Disposition", value: 'attachment; filename="medicare-erp-source.zip"' },
          { key: "Content-Type", value: "application/zip" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
