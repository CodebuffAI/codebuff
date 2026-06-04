import type { AuthConfig } from 'convex/server'

const issuer = 'https://freebuff.com'

export default {
  providers: [
    {
      type: 'customJwt',
      issuer,
      jwks: `${issuer}/api/web/.well-known/jwks.json`,
      applicationID: 'vly-convex',
      algorithm: 'RS256',
    },
  ],
} satisfies AuthConfig
