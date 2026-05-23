/**
 * Add osu! login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/osu
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import Osu from "@auth/core/providers/osu"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Osu({ clientId: OSU_CLIENT_ID, clientSecret: OSU_CLIENT_SECRET }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 *  - [osu! OAuth documentation](https://osu.ppy.sh/docs/index.html#authentication)
 *  - [osu! app console](https://osu.ppy.sh/home/account/edit#new-oauth-application)
 *
 * ### Notes
 *
 * By default, Auth.js assumes that the Osu provider is
 * based on the [OAuth 2](https://www.rfc-editor.org/rfc/rfc6749.html) specification.
 *
 * :::note
 *
 * osu! does not provide a user email.
 *
 * :::
 *
 * :::tip
 *
 * The osu! provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/osu.ts).
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
export default function Osu(options) {
    return {
        id: "osu",
        name: "osu!",
        type: "oauth",
        token: "https://osu.ppy.sh/oauth/token",
        authorization: "https://osu.ppy.sh/oauth/authorize?scope=identify",
        userinfo: "https://osu.ppy.sh/api/v2/me",
        profile(profile) {
            return {
                id: profile.id.toString(),
                email: null,
                name: profile.username,
                image: profile.avatar_url,
            };
        },
        options,
    };
}
