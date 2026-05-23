/**
 * <div class="provider" style={{backgroundColor: "#000", display: "flex", justifyContent: "space-between", color: "#fff", padding: 16}}>
 * <span>Built-in <b>Strava</b> integration.</span>
 * <a href="https://www.strava.com/">
 *   <img style={{display: "block"}} src="https://authjs.dev/img/providers/strava.svg" height="48" />
 * </a>
 * </div>
 *
 * @module providers/strava
 */
import type { OAuthConfig, OAuthUserConfig } from "./index.js";
export interface StravaProfile extends Record<string, any> {
    id: string;
    firstname: string;
    lastname: string;
    profile: string;
}
/**
 * Add Strava login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/strava
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import Strava from "@auth/core/providers/strava"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Strava({ clientId: STRAVA_CLIENT_ID, clientSecret: STRAVA_CLIENT_SECRET }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 * - [Strava API documentation](http://developers.strava.com/docs/reference/)
 *
 * ### Notes
 *
 * By default, Auth.js assumes that the Strava provider is
 * based on the [OAuth 2](https://www.rfc-editor.org/rfc/rfc6749.html) specification.
 *
 * :::tip
 *
 * The Strava provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/strava.ts).
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
export default function Strava<P extends StravaProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
//# sourceMappingURL=strava.d.ts.map