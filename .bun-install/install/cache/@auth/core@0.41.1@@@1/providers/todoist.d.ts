/**
 * <div class="provider" style={{backgroundColor: "#000", display: "flex", justifyContent: "space-between", color: "#fff", padding: 16}}>
 * <span>Built-in <b>Todoist</b> integration.</span>
 * <a href="https://www.todoist.com/">
 *   <img style={{display: "block"}} src="https://authjs.dev/img/providers/todoist.svg" height="48" />
 * </a>
 * </div>
 *
 * @module providers/todoist
 */
import type { OAuthConfig, OAuthUserConfig } from "./index.js";
/**
 * @see https://developer.todoist.com/sync/v9/#user
 */
interface TodoistProfile extends Record<string, any> {
    avatar_big: string;
    email: string;
    full_name: string;
    id: string;
}
/**
 * Add Todoist login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/todoist
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import Todoist from "@auth/core/providers/todoist"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Todoist({
 *       clientId: TODOIST_CLIENT_ID,
 *       clientSecret: TODOIST_CLIENT_SECRET,
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 * - [Todoist OAuth documentation](https://developer.todoist.com/guides/#oauth)
 * - [Todoist configuration](https://developer.todoist.com/appconsole.html)
 *
 * ### Notes
 *
 * By default, Auth.js assumes that the Todoist provider is
 * based on the [OAuth 2](https://www.rfc-editor.org/rfc/rfc6749.html) specification.
 *
 * :::tip
 *
 * The Todoist provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/todoist.ts).
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
export default function TodoistProvider<P extends TodoistProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
export {};
//# sourceMappingURL=todoist.d.ts.map