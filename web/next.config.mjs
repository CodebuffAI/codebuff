import createMDX from '@next/mdx'
import { withContentlayer } from 'next-contentlayer'
import { env } from '@codebuff/internal/env'

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Disable ESLint during builds
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Disable TypeScript errors during builds
    ignoreBuildErrors: true,
  },

  // Enable experimental features for better SSG performance
  experimental: {
    optimizePackageImports: ['@/components/ui'],
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false }
    // Tell Next.js to leave pino and thread-stream unbundled
    config.externals.push(
      { 'thread-stream': 'commonjs thread-stream', pino: 'commonjs pino' },
      'pino-pretty',
      'encoding',
      'perf_hooks',
      'async_hooks',
    )

    // Suppress contentlayer webpack cache warnings
    config.infrastructureLogging = {
      level: 'error',
    }

    return config
  },
  pageExtensions: ['js', 'jsx', 'mdx', 'ts', 'tsx'],
  headers: () => {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
        ],
      },
      {
        source: '/api/auth/cli/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type',
          },
        ],
      },
    ]
  },
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
      {
        source: '/ingest/decide',
        destination: 'https://us.i.posthog.com/decide',
      },
    ]
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'manicode.ai',
          },
        ],
        permanent: false,
        destination: `${process.env.NEXT_PUBLIC_CODEBUFF_APP_URL}/:path*`,
      },
      {
        source: '/api-keys',
        destination: '/profile?tab=api-keys',
        permanent: true,
      },
      {
        source: '/usage',
        destination: '/profile?tab=usage',
        permanent: true,
      },
      {
        source: '/referrals',
        destination: '/profile?tab=referrals',
        permanent: true,
      },
      {
        source: '/discord',
        destination: 'https://discord.gg/mcWTGjgTj3',
        permanent: false,
      },
      {
        source: '/releases',
        destination:
          'https://github.com/CodebuffAI/codebuff-community/releases',
        permanent: false,
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
}

export default withContentlayer(withMDX(nextConfig))
