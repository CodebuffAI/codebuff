/**
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/auth0
 * ```
 *
 * #### Configuration
 * ```ts
 * import { Auth } from "@auth/core"
 * import Auth0 from "@auth/core/providers/auth0"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Auth0({
 *       clientId: AUTH0_ID,
 *       clientSecret: AUTH0_SECRET,
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 * - [Auth0 docs](https://auth0.com/docs/authenticate)
 *
 * ### Notes
 *
 * The Auth0 provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/auth0.ts). To override the defaults for your use case, check out [customizing a built-in OAuth provider](https://authjs.dev/guides/configuring-oauth-providers).
 *
 * ## Help
 *
 * If you think you found a bug in the default configuration, you can [open an issue](https://authjs.dev/new/provider-issue).
 *
 * Auth.js strictly adheres to the specification and it cannot take responsibility for any deviation from
 * the spec by the provider. You can open an issue, but if the problem is non-compliance with the spec,
 * we might not pursue a resolution. You can ask for more help in [Discussions](https://authjs.dev/new/github-discussions).
 */
export default function Auth0(config) {
    return {
        id: "auth0",
        name: "Auth0",
        type: "oidc",
        style: { text: "#fff", bg: "#EB5424" },
        options: config,
    };
}
