/**
 * Add Pipedrive login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/pipedrive
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import Pipedrive from "@auth/core/providers/pipedrive"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Pipedrive({
 *       clientId: PIPEDRIVE_CLIENT_ID,
 *       clientSecret: PIPEDRIVE_CLIENT_SECRET,
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 *  - [Pipedrive OAuth documentation](https://pipedrive.readme.io/docs/marketplace-oauth-authorization)
 *
 * ### Notes
 *
 * By default, Auth.js assumes that the Pipedrive provider is
 * based on the [OAuth 2](https://www.rfc-editor.org/rfc/rfc6749.html) specification.
 *
 * :::tip
 *
 * The Pipedrive provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/pipedrive.ts).
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
export default function Pipedrive(options) {
    return {
        id: "pipedrive",
        name: "Pipedrive",
        type: "oauth",
        authorization: "https://oauth.pipedrive.com/oauth/authorize",
        token: "https://oauth.pipedrive.com/oauth/token",
        userinfo: "https://api.pipedrive.com/users/me",
        profile: ({ data: profile }) => {
            return {
                id: profile.id.toString(),
                name: profile.name,
                email: profile.email,
                image: profile.icon_url,
            };
        },
        options,
    };
}
