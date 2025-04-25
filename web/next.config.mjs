import { withContentlayer } from 'next-contentlayer'
import createMDX from '@next/mdx'
import { env } from './src/env.mjs'

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false }
    // Tell Next.js to leave pino and thread-stream unbundled
    config.externals.push(
      { 'thread-stream': 'commonjs thread-stream', pino: 'commonjs pino' },
      'pino-pretty',
      'encoding'
    )
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
        destination: `${env.NEXT_PUBLIC_APP_URL}/:path*`,
      },
      {
        source: '/discord',
        destination: 'https://discord.gg/mcWTGjgTj3',
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
