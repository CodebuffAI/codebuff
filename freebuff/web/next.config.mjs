import { resolve } from 'path'
import { blogSlugRedirects } from './blog-redirects.mjs'
import dotenv from 'dotenv'

const repoRoot = resolve(import.meta.dirname, '../..')

dotenv.config({
  path: resolve(repoRoot, '.env.local'),
  override: false,
})
dotenv.config({
  path: resolve(repoRoot, '.env.development.local'),
  override: true,
})

const FREEBUFF_PORT =
  process.env.PORT || process.env.NEXT_PUBLIC_WEB_PORT || '3002'
const monorepoRoot = resolve(import.meta.dirname, '../../')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle under `.next/standalone` so the Render
  // deploy artifact can ship without the 3.9GB hoisted monorepo `node_modules`
  // (electron/react-native/expo siblings the web server never loads). The
  // assemble-standalone.mjs post-build step copies in static/public and the
  // runtime assets Next's file tracer can't follow (see that script).
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  env: {
    // In development, point Freebuff-specific URLs at the Freebuff dev server.
    // In production, set these via deployment env vars.
    ...(process.env.NODE_ENV === 'development'
      ? {
          NEXT_PUBLIC_FREEBUFF_APP_URL: `http://localhost:${FREEBUFF_PORT}`,
          NEXTAUTH_FREEBUFF_URL: `http://localhost:${FREEBUFF_PORT}`,
        }
      : {}),
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: [
    'pino',
    'thread-stream',
    'pino-pretty',
    // Reads its data files from node_modules at runtime; must stay unbundled.
    'geoip-country',
    // Ships WASM modules (tree-sitter, quickjs) that bundlers can't resolve;
    // loaded from its built dist at runtime (see prepare:workspace).
    '@codebuff/sdk',
    '@codebuff/code-map',
    '@codebuff/code-map/parse',
    '@codebuff/code-map/languages',
    // Document extraction for chat uploads: unpdf bundles pdf.js (dynamic
    // imports/workers), mammoth uses Node built-ins + dynamic requires, exceljs
    // bundles a zip/stream stack, and turndown needs its own DOM — keep them
    // unbundled so they load from node_modules at runtime.
    'unpdf',
    'mammoth',
    'exceljs',
    'turndown',
    'turndown-plugin-gfm',
    // NOTE: lz4-wasm is intentionally NOT listed here. serverExternalPackages
    // only works for packages Node can require() at runtime; lz4-wasm is an
    // ESM-only wasm-pack bundler build. Turbopack bundles it natively and
    // emits the .wasm file next to the chunk (inside the standalone output),
    // so no server-side stub is needed — unlike the old webpack build, where
    // the emitted wasm chunk path was unreadable at runtime (ENOENT in prod).
  ],
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
    serverComponentsHmrCache: true,
    // Persist Turbopack's build cache under .next/cache so the Render
    // build-cache stash (scripts/render-next-cache.mjs) makes rebuilds warm.
    turbopackFileSystemCacheForBuild: true,
  },
  turbopack: {
    // Keep Turbopack scoped to this Next app. Letting it infer the monorepo
    // lockfile root makes local Vly dev crawl and cache the whole repo.
    root:
      process.env.NODE_ENV === 'production'
        ? monorepoRoot
        : import.meta.dirname,
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
      {
        // WebContainer requires the page to be cross-origin isolated. Scoped to
        // the project workspace routes only (not site-wide) because COOP
        // same-origin can break window.opener-based flows (e.g. OAuth popups)
        // on other pages.
        source: '/web/project/:path*',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'credentialless',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
    ]
  },
  reactStrictMode: false,
  async redirects() {
    const blogRedirects = blogSlugRedirects.map((r) => ({
      ...r,
      permanent: true,
    }))
    return [
      ...blogRedirects,
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
        source: '/pricing',
        destination: '/web',
        permanent: true,
      },
      {
        source: '/web/pricing',
        destination: '/web',
        permanent: true,
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
