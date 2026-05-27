import { resolve } from 'path'
import dotenv from 'dotenv'

dotenv.config({
  path: resolve(import.meta.dirname, '../../.env.local'),
  override: false,
})

const FREEBUFF_PORT =
  process.env.PORT || process.env.NEXT_PUBLIC_WEB_PORT || '3002'

// Two forms of the autumn shim path are needed because Webpack and Turbopack
// disagree on what a `resolveAlias` value can be:
//   - Webpack happily accepts absolute paths.
//   - Turbopack treats values that start with `/` as server-relative URLs and
//     errors with "server relative imports are not implemented yet". It wants
//     either a bare module specifier or a project-relative path beginning with
//     `./`.
const autumnShimRelative = './src/vly/lib/autumn-disabled-react.tsx'
const autumnShimAbsolute = resolve(import.meta.dirname, autumnShimRelative)

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
  serverExternalPackages: [
    'pino',
    'thread-stream',
    'pino-pretty',
    '@codebuff/code-map',
    '@codebuff/code-map/parse',
    '@codebuff/code-map/languages',
  ],
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
    serverComponentsHmrCache: true,
  },
  turbopack: {
    root: resolve(import.meta.dirname, '../../'),
    resolveAlias: {
      'autumn-js/react': autumnShimRelative,
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      'autumn-js/react': autumnShimAbsolute,
    }
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
      {
        source: '/project/:path*',
        destination: '/web/project/:path*',
        permanent: false,
      },
      {
        source: '/dashboard/:path*',
        destination: '/web/dashboard/:path*',
        permanent: false,
      },
      {
        source: '/community/:path*',
        destination: '/web/community/:path*',
        permanent: false,
      },
      {
        source: '/admin/:path*',
        destination: '/web/admin/:path*',
        permanent: false,
      },
      {
        source: '/earn/:path*',
        destination: '/web/earn/:path*',
        permanent: false,
      },
      {
        source: '/pricing',
        destination: '/web/pricing',
        permanent: false,
      },
      {
        source: '/contact',
        destination: '/web/contact',
        permanent: false,
      },
      {
        source: '/referrals',
        destination: '/web/referrals',
        permanent: false,
      },
      {
        source: '/devtools',
        destination: '/web/devtools',
        permanent: false,
      },
      {
        source: '/invite/:path*',
        destination: '/web/invite/:path*',
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
