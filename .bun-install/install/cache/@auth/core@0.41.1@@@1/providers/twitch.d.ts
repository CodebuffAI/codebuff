/**
 * <div class="provider" style={{backgroundColor: "#000", display: "flex", justifyContent: "space-between", color: "#fff", padding: 16}}>
 * <span>Built-in <b>Twitch</b> integration.</span>
 * <a href="https://www.twitch.tv/">
 *   <img style={{display: "block"}} src="https://authjs.dev/img/providers/twitch.svg" height="48" />
 * </a>
 * </div>
 *
 * @module providers/twitch
 */
import type { OIDCConfig, OIDCUserConfig } from "./index.js";
export interface TwitchProfile extends Record<string, any> {
    sub: string;
    preferred_username: string;
    email: string;
    picture: string;
}
/**
 * Add Twitch login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/twitch
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import Twitch from "@auth/core/providers/twitch"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Twitch({ clientId: TWITCH_CLIENT_ID, clientSecret: TWITCH_CLIENT_SECRET }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 * - [Twitch app documentation](https://dev.twitch.tv/console/apps)
 *
 * Add the following redirect URL into the console `http://<your-next-app-url>/api/auth/callback/twitch`
 *
 *
 * ### Notes
 *
 * By default, Auth.js assumes that the Twitch provider is
 * based on the [Open ID Connect](https://openid.net/specs/openid-connect-core-1_0.html) specification.
 *
 * :::tip
 *
 * The Twitch provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/twitch.ts).
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
export default function Twitch(config: OIDCUserConfig<TwitchProfile>): OIDCConfig<TwitchProfile>;
//# sourceMappingURL=twitch.d.ts.map