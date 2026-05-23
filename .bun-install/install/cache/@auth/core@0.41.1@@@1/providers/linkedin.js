/**
 * Add LinkedIn login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/linkedin
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import LinkedIn from "@auth/core/providers/linkedin"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     LinkedIn({
 *       clientId: LINKEDIN_CLIENT_ID,
 *       clientSecret: LINKEDIN_CLIENT_SECRET,
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 *  - [LinkedIn OAuth documentation](https://docs.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
 *  - [LinkedIn app console](https://www.linkedin.com/developers/apps/)
 *
 * ### Notes
 *
 * By default, Auth.js assumes that the LinkedIn provider is
 * based on the [OIDC](https://openid.net/specs/openid-connect-core-1_0.html) specification.
 *
 * :::tip
 *
 * The LinkedIn provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/linkedin.ts).
 * To override the defaults for your use case, check out [customizing a built-in OAuth provider](https://authjs.dev/guides/configuring-oauth-providers).
 *
 * :::
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
export default function LinkedIn(options) {
    return {
        id: "linkedin",
        name: "LinkedIn",
        type: "oidc",
        client: { token_endpoint_auth_method: "client_secret_post" },
        issuer: "https://www.linkedin.com/oauth",
        style: { bg: "#069", text: "#fff" },
        checks: ["state"],
        options,
    };
}
