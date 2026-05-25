import { NextConfig } from "next";

import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  redirects: async () => {
    return [
      {
        source: "/awp",
        destination:
          "/?utm_source=instagram&utm_medium=social&utm_campaign=algorithms_with_peter",
        permanent: true,
      },
      {
        source: "/docs",
        destination: "https://docs.vly.ai",
        permanent: false,
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
