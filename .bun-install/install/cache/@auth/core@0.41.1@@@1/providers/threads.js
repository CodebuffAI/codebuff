/**
 * Add Threads login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/threads
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import Threads from "@auth/core/providers/threads"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Threads({
 *       clientId: THREADS_CLIENT_ID,
 *       clientSecret: THREADS_CLIENT_SECRET,
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 * - [Threads OAuth documentation](https://developers.facebook.com/docs/threads)
 * - [Threads OAuth apps](https://developers.facebook.com/apps/)
 *
 * ### Notes
 *
 * :::warning
 *
 * Email address is not returned by the Threads API.
 *
 * :::
 *
 * :::tip
 *
 * Threads required callback URL to be configured in your Facebook app and Facebook required you to use **https** even for localhost! In order to do that, you either need to [add an SSL to your localhost](https://www.freecodecamp.org/news/how-to-get-https-working-on-your-local-development-environment-in-5-minutes-7af615770eec/) or use a proxy such as [ngrok](https://ngrok.com/docs).
 *
 * :::
 *
 * By default, Auth.js assumes that the Threads provider is
 * based on the [OAuth 2](https://www.rfc-editor.org/rfc/rfc6749.html) specification.
 *
 * :::tip
 *
 * The Threads provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/threads.ts).
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
export default function Threads(config) {
    return {
        id: "threads",
        name: "Threads",
        type: "oauth",
        checks: ["state"],
        authorization: "https://threads.net/oauth/authorize?scope=threads_basic",
        token: "https://graph.threads.net/oauth/access_token",
        userinfo: "https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url",
        client: {
            token_endpoint_auth_method: "client_secret_post",
        },
        profile({ data }) {
            return {
                id: data.id,
                name: data.username || null,
                email: null,
                image: data.threads_profile_picture_url || null,
            };
        },
        style: { bg: "#000", text: "#fff" },
        options: config,
    };
}
