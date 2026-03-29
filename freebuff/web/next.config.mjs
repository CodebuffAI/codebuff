import { resolve } from 'path'

const FREEBUFF_PORT = 3002

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: resolve(import.meta.dirname, '../../'),
  env: {
    // In development, override the app URL to point to the Freebuff dev server port.
    // In production, NEXT_PUBLIC_CODEBUFF_APP_URL is set via deployment env vars.
    ...(process.env.NODE_ENV === 'development'
      ? {
          NEXT_PUBLIC_CODEBUFF_APP_URL: `http://localhost:${FREEBUFF_PORT}`,
          NEXTAUTH_URL: `http://localhost:${FREEBUFF_PORT}`,
        }
      : {}),
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false, path: false }
    config.externals.push(
      { 'thread-stream': 'commonjs thread-stream', pino: 'commonjs pino' },
      'pino-pretty',
      'encoding',
      'perf_hooks',
      'async_hooks',
    )
    config.externals.push(
      '@codebuff/code-map',
      '@codebuff/code-map/parse',
      '@codebuff/code-map/languages',
      /^@codebuff\/code-map/,
    )
    config.infrastructureLogging = {
      level: 'error',
    }
    return config
  },
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
  async redirects() {
    return [
      {
        source: '/b/:hash',
        destination: 'https://go.trybeluga.ai/:hash',
        permanent: false,
      },
    ]
  },
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
    ]
  },
}

export default nextConfig
