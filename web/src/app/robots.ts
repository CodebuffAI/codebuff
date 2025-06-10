import { MetadataRoute } from 'next'

import { env } from '@/env'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${env.NEXT_PUBLIC_APP_URL}/sitemap.xml`,
  }
}
