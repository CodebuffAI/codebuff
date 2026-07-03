import type { AuthConfig } from "convex/server";

const issuer =
  process.env.VLY_CONVEX_AUTH_ISSUER ??
  process.env.CONVEX_SITE_URL ??
  "http://localhost:5173";

export default {
  providers: [
    {
      type: "customJwt",
      issuer,
      jwks: `${issuer}/api/web/.well-known/jwks.json`,
      applicationID: "convex",
      algorithm: "RS256",
    },
  ],
} satisfies AuthConfig;
