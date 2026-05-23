/**
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/bankid-no
 * ```
 *
 * #### Configuration
 * ```ts
 * import { Auth } from "@auth/core"
 * import BankIDNorge from "@auth/core/providers/bankid-no"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Auth0({
 *       clientId: AUTH_BANKID_NO_ID,
 *       clientSecret: AUTH_BANKID_NO_SECRET,
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 * - [OpenID Connect Provider from BankID](https://confluence.bankidnorge.no/confluence/pdoidcl)
 *
 * ### Notes
 *
 * The BankID Norge provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/bankid-no.ts). To override the defaults for your use case, check out [customizing a built-in OAuth provider](https://authjs.dev/guides/configuring-oauth-providers).
 *
 * ## Help
 *
 * If you think you found a bug in the default configuration, you can [open an issue](https://authjs.dev/new/provider-issue).
 *
 * Auth.js strictly adheres to the specification and it cannot take responsibility for any deviation from
 * the spec by the provider. You can open an issue, but if the problem is non-compliance with the spec,
 * we might not pursue a resolution. You can ask for more help in [Discussions](https://authjs.dev/new/github-discussions).
 */
export default function BankIDNorway(config) {
    return {
        id: "bankid-no",
        name: "BankID Norge",
        type: "oidc",
        issuer: "https://auth.bankid.no/auth/realms/prod",
        client: {
            token_endpoint_auth_method: "client_secret_post",
            userinfo_signed_response_alg: "RS256",
        },
        idToken: false,
        authorization: { params: { ui_locales: "no", login_hint: "BIS" } },
        profile(profile) {
            return {
                id: profile.sub,
                name: profile.name,
                email: profile.email ?? null,
                image: null,
            };
        },
        checks: ["pkce", "state", "nonce"],
        style: { text: "#fff", bg: "#39134c" },
        options: config,
    };
}
