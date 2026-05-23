/**
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/kinde
 * ```
 *
 * #### Configuration
 * ```ts
 * import { Auth } from "@auth/core"
 * import Kinde from "@auth/core/providers/kinde"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Kinde({
 *       clientId: KINDE_CLIENT_ID,
 *       clientSecret: KINDE_CLIENT_SECRET,
 *       issuer: KINDE_DOMAIN,
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 * - [Kinde docs](https://docs.kinde.com/)
 *
 * ### Notes
 *
 * The Kinde provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/kinde.ts). To override the defaults for your use case, check out [customizing a built-in OAuth provider](https://authjs.dev/guides/configuring-oauth-providers).
 *
 * ## Help
 *
 * If you think you found a bug in the default configuration, you can [open an issue](https://authjs.dev/new/provider-issue).
 *
 * Auth.js strictly adheres to the specification and it cannot take responsibility for any deviation from
 * the spec by the provider. You can open an issue, but if the problem is non-compliance with the spec,
 * we might not pursue a resolution. You can ask for more help in [Discussions](https://authjs.dev/new/github-discussions).
 */
export default function Kinde(config) {
    return {
        id: "kinde",
        name: "Kinde",
        type: "oidc",
        style: { text: "#0F0F0F", bg: "#fff" },
        options: config,
        checks: ["state", "pkce"],
    };
}
