/**
 * <div class="provider" style={{backgroundColor: "#000", display: "flex", justifyContent: "space-between", color: "#fff", padding: 16}}>
 * <span>Built-in <b>Notion</b> integration.</span>
 * <a href="https://notion.so">
 *   <img style={{display: "block"}} src="https://authjs.dev/img/providers/notion.svg" height="48" width="48"/>
 * </a>
 * </div>
 *
 * @module providers/notion
 */
import type { OAuthConfig, OAuthUserConfig } from "./oauth.js";
export interface Person extends Record<string, any> {
    email: string;
}
export interface User extends Record<string, any> {
    object: "user" | "bot";
    id: string;
    type: string;
    name: string;
    avatar_url: null | string;
    person: Person;
    owner?: {
        type: "workspace" | "user";
        workspace: string;
    };
    workspace_name?: string | null;
}
export interface Owner {
    type: string;
    user: User;
}
export interface NotionProfile extends Record<string, any> {
    access_token: string;
    bot_id: string;
    duplicated_template_id: string;
    owner?: Owner;
    workspace_icon: string;
    workspace_id: number;
    workspace_name: string;
}
interface AdditionalConfig {
    redirectUri: string;
}
/**
 * Add Notion login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/notion
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import Notion from "@auth/core/providers/notion"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Notion({
 *       clientId: NOTION_CLIENT_ID,
 *       clientSecret: NOTION_CLIENT_SECRET,
 *       redirectUri: NOTION_CLIENT_REDIRECT_URI,
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 * - [Notion Docs](https://developers.notion.com/docs)
 * - [Notion Authorization Docs](https://developers.notion.com/docs/authorization)
 * - [Notion Integrations](https://www.notion.so/my-integrations)
 *
 * ### Notes
 * You need to select "Public Integration" on the configuration page to get an `oauth_id` and `oauth_secret`. Private integrations do not provide these details.
 * You must provide a `clientId` and `clientSecret` to use this provider, as-well as a redirect URI (due to this being required by Notion endpoint to fetch tokens).
 *
 * :::tip
 *
 * The Notion provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/notion.ts).
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
export default function NotionProvider<P extends NotionProfile>(options: OAuthUserConfig<P> & AdditionalConfig): OAuthConfig<P>;
export {};
//# sourceMappingURL=notion.d.ts.map