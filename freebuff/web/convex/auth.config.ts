import type { AuthConfig } from 'convex/server'

const issuer = process.env.VLY_CONVEX_AUTH_ISSUER ?? 'https://freebuff.com'

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
