/** @type {import('next').NextConfig} */
import { env } from './src/env.mjs'

const nextConfig = {
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
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
  reactStrictMode: false,
  async redirects() {
    if (
      typeof window !== 'undefined' &&
      window.location.origin !== env.NEXT_PUBLIC_APP_URL
    ) {
      return [
        {
          source: ':path*',
          destination: `${env.NEXT_PUBLIC_APP_URL}/:path*`,
        },
      ]
    }
    return []
  },
}

export default nextConfig
