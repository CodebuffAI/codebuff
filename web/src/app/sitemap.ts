import { env } from '@codebuff/common/env'

import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: env.NEXT_PUBLIC_CODEBUFF_APP_URL || '/',
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 1,
      alternates: {
        languages: {
          pl: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/pl`,
        },
      },
    },
  ]
}
