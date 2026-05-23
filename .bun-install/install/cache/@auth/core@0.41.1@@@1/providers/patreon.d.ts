/**
 * <div class="provider" style={{backgroundColor: "#000", display: "flex", justifyContent: "space-between", color: "#fff", padding: 16}}>
 * <span>Built-in <b>Patreon</b> integration.</span>
 * <a href="https://www.patreon.com/">
 *   <img style={{display: "block"}} src="https://authjs.dev/img/providers/patreon.svg" height="48" />
 * </a>
 * </div>
 *
 * @module providers/patreon
 */
import type { OAuthConfig, OAuthUserConfig } from "./index.js";
export interface PatreonProfile extends Record<string, any> {
    sub: string;
    nickname: string;
    email: string;
    picture: string;
}
/**
 * Add Patreon login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/patreon
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import Patreon from "@auth/core/providers/patreon"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Patreon({
 *       clientId: PATREON_CLIENT_ID,
 *       clientSecret: PATREON_CLIENT_SECRET,
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 *  - [Patreon OAuth documentation](https://docs.patreon.com/#apiv2-oauth)
 *  - [Patreon Platform](https://www.patreon.com/portal/registration/register-clients)
 *  - [ApiV2 Scopes](https://docs.patreon.com/#scopes)
 *
 * ### Notes
 *
 * By default, Auth.js assumes that the Patreon provider is
 * based on the [OAuth 2](https://www.rfc-editor.org/rfc/rfc6749.html) specification.
 *
 * :::tip
 *
 * The Patreon provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/patreon.ts).
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
export default function Patreon<P extends PatreonProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
//# sourceMappingURL=patreon.d.ts.map