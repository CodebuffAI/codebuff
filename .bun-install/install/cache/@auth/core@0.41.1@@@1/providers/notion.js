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
const NOTION_HOST = "https://api.notion.com";
const NOTION_API_VERSION = "2022-06-28";
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
export default function NotionProvider(options) {
    return {
        id: "notion",
        name: "Notion",
        type: "oauth",
        token: {
            url: `${NOTION_HOST}/v1/oauth/token`,
        },
        userinfo: {
            url: `${NOTION_HOST}/v1/users`,
            // The result of this method will be the input to the `profile` callback.
            // We use a custom request handler, since we need to do things such as pass the "Notion-Version" header
            // More info: https://authjs.dev/getting-started/providers/notion
            async request(context) {
                const profile = await fetch(`${NOTION_HOST}/v1/users/me`, {
                    headers: {
                        Authorization: `Bearer ${context.tokens.access_token}`,
                        "Notion-Version": NOTION_API_VERSION,
                    },
                });
                const { bot: { owner: { user }, }, } = await profile.json();
                return user;
            },
        },
        authorization: {
            params: {
                client_id: options.clientId,
                response_type: "code",
                owner: "user",
                redirect_uri: options.redirectUri,
            },
            url: `${NOTION_HOST}/v1/oauth/authorize`,
        },
        async profile(profile) {
            return {
                id: profile.id,
                name: profile.name,
                email: profile.person.email,
                image: profile.avatar_url,
            };
        },
        style: { bg: "#fff", text: "#000" },
        options,
    };
}
