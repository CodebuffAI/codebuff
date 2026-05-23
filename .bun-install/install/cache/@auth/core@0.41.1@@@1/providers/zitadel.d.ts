/**
 * <div class="provider" style={{backgroundColor: "#000", display: "flex", justifyContent: "space-between", color: "#fff", padding: 16}}>
 * <span>Built-in <b>Zitadel</b> integration.</span>
 * <a href="https://zitadel.com/">
 *   <img style={{display: "block"}} src="https://authjs.dev/img/providers/zitadel.svg" height="48"/>
 * </a>
 * </div>
 *
 * @module providers/zitadel
 */
import type { OIDCConfig, OAuthUserConfig } from "./index.js";
/**
 * The returned user profile from ZITADEL when using the profile callback. See the standard claims reference [here](https://zitadel.com/docs/apis/openidoauth/claims#standard-claims).
 * If you need access to ZITADEL APIs or need additional information, make sure to add the corresponding scopes.
 */
export interface ZitadelProfile extends Record<string, any> {
    amr: string;
    aud: string;
    auth_time: number;
    azp: string;
    email: string;
    email_verified: boolean;
    exp: number;
    family_name: string;
    given_name: string;
    gender: string;
    iat: number;
    iss: string;
    jti: string;
    locale: string;
    name: string;
    nbf: number;
    picture: string;
    phone: string;
    phone_verified: boolean;
    preferred_username: string;
    sub: string;
}
/**
 * Add ZITADEL login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/zitadel
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import ZITADEL from "@auth/core/providers/zitadel"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     ZITADEL({
 *       clientId: ZITADEL_CLIENT_ID,
 *       clientSecret: ZITADEL_CLIENT_SECRET,
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 * - [ZITADEL OpenID Endpoints](https://zitadel.com/docs/apis/openidoauth/endpoints)
 * - [ZITADEL recommended OAuth Flows](https://zitadel.com/docs/guides/integrate/oauth-recommended-flows)
 *
 * ### Notes
 *
 * By default, Auth.js assumes that the ZITADEL provider is
 * based on the [Open ID Connect](https://openid.net/specs/openid-connect-core-1_0.html) specification.
 *
 * The Redirect URIs used when creating the credentials must include your full domain and end in the callback path. For example:
 * - For production: `https://{YOUR_DOMAIN}/api/auth/callback/zitadel`
 * - For development: `http://localhost:3000/api/auth/callback/zitadel`
 *
 * Make sure to enable dev mode in ZITADEL console to allow redirects for local development.
 *
 * :::tip
 *
 * The ZITADEL provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/zitadel.ts).
 * To override the defaults for your use case, check out [customizing a built-in OAuth provider](https://authjs.dev/guides/configuring-oauth-providers).
 *
 * :::
 * :::tip
 *
 * ZITADEL also returns a email_verified boolean property in the profile. You can use this property to restrict access to people with verified accounts.
 * ```ts
 * const options = {
 *   ...
 *   callbacks: {
 *     async signIn({ account, profile }) {
 *       if (account.provider === "zitadel") {
 *         return profile.email_verified;
 *       }
 *       return true; // Do different verification for other providers that don't have `email_verified`
 *     },
 *   }
 *   ...
 * }
 * ```
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
export default function ZITADEL<P extends ZitadelProfile>(options: OAuthUserConfig<P>): OIDCConfig<P>;
//# sourceMappingURL=zitadel.d.ts.map