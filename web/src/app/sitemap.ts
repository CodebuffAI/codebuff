import { MetadataRoute } from 'next'

import { env } from '@codebuff/internal'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: env.NEXT_PUBLIC_APP_URL || '/',
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 1,
      alternates: {
        languages: {
          pl: `${env.NEXT_PUBLIC_APP_URL}/pl`,
        },
      },
    },
  ]
}
