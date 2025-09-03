import { env } from '@codebuff/internal'

import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/sitemap.xml`,
  }
}
