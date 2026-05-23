/**
 * Add Twitter login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/twitter
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import Twitter from "@auth/core/providers/twitter"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Twitter({
 *       clientId: TWITTER_CLIENT_ID,
 *       clientSecret: TWITTER_CLIENT_SECRET,
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 * - [Twitter App documentation](https://developer.x.com/en/apps)
 *
 * ## OAuth 2
 * Twitter supports OAuth 2, which is currently opt-in. To enable it, simply add version: "2.0" to your Provider configuration:
 * ```ts
 * Twitter({
 *   clientId: process.env.TWITTER_ID,
 *   clientSecret: process.env.TWITTER_SECRET,
 *   version: "2.0", // opt-in to Twitter OAuth 2.0
 * })
 * ```
 * Keep in mind that although this change is easy, it changes how and with which of Twitter APIs you can interact with. Read the official Twitter OAuth 2 documentation for more details.
 *
 *
 * :::note
 *
 * Email is currently not supported by Twitter OAuth 2.0.
 *
 * :::
 *
 * ### Notes
 *
 * Twitter is currently the only built-in provider using the OAuth 1.0 spec.
 * This means that you won't receive an `access_token` or `refresh_token`, but an `oauth_token` and `oauth_token_secret` respectively. Remember to add these to your database schema, in case if you are using an [Adapter](https://authjs.dev/reference/core/adapters).
 *
 * :::tip
 *
 * You must enable the "Request email address from users" option in your app permissions if you want to obtain the users email address.
 *
 * :::
 *
 * By default, Auth.js assumes that the Twitter provider is
 * based on the [OAuth 2](https://www.rfc-editor.org/rfc/rfc6749.html) specification.
 *
 * :::tip
 *
 * The Twitter provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/twitter.ts).
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
export default function Twitter(config) {
    return {
        id: "twitter",
        name: "Twitter",
        type: "oauth",
        checks: ["pkce", "state"],
        authorization: "https://x.com/i/oauth2/authorize?scope=users.read tweet.read offline.access",
        token: "https://api.x.com/2/oauth2/token",
        userinfo: "https://api.x.com/2/users/me?user.fields=profile_image_url",
        profile({ data }) {
            return {
                id: data.id,
                name: data.name,
                email: data.email ?? null,
                image: data.profile_image_url,
            };
        },
        style: { bg: "#1da1f2", text: "#fff" },
        options: config,
    };
}
