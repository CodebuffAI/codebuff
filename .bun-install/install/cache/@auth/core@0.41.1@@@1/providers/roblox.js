/**
 * Add Roblox login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/roblox
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import Roblox from "@auth/providers/roblox"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Roblox({
 *       clientId: AUTH_ROBLOX_ID,
 *       clientSecret: AUTH_ROBLOX_SECRET,
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 *  - [Roblox OAuth documentation](https://create.roblox.com/docs/cloud/open-cloud/oauth2-overview)
 *  - [Roblox OAuth apps](https://create.roblox.com/dashboard/credentials?activeTab=OAuthTab)
 *
 * :::info **Disclaimer**
 *
 * If you think you found a bug in the default configuration, you can [open an issue](https://authjs.dev/new/provider-issue).
 *
 * Auth.js strictly adheres to the specification and it cannot take responsibility for any deviation from
 * the spec by the provider. You can open an issue, but if the problem is non-compliance with the spec,
 * we might not pursue a resolution. You can ask for more help in [Discussions](https://authjs.dev/new/github-discussions).
 *
 * :::
 */
export default function Roblox(options) {
    return {
        id: "roblox",
        name: "Roblox",
        type: "oidc",
        authorization: { params: { scope: "openid profile" } },
        issuer: "https://apis.roblox.com/oauth/",
        checks: ["pkce", "state"],
        style: { bg: "#5865F2", text: "#fff" },
        options,
    };
}
