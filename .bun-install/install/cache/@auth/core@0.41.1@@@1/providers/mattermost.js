/**
 * Add Mattermost login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/mattermost
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import Mattermost from "@auth/core/providers/mattermost"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Mattermost({
 *       clientId: MATTERMOST_CLIENT_ID,
 *       clientSecret: MATTERMOST_CLIENT_SECRET,
 *       issuer: MATTERMOST_ISSUER, // The base url of your Mattermost instance. e.g `https://my-cool-server.cloud.mattermost.com`
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 *  - [Mattermost OAuth documentation](https://example.com)
 *
 * ### Notes
 *
 * By default, Auth.js assumes that the Mattermost provider is
 * based on the [OAuth 2](https://www.rfc-editor.org/rfc/rfc6749.html) specification.
 *
 * To create your Mattermost OAuth2 app visit `http://<your Mattermost instance url>/<your team>/integrations/oauth2-apps`
 *
 * :::warning
 *
 * The Mattermost provider requires the `issuer` option to be set. This is the base url of your Mattermost instance. e.g https://my-cool-server.cloud.mattermost.com
 *
 * :::
 *
 * :::tip
 *
 * The Mattermost provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/mattermost.ts).
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
export default function Mattermost(config) {
    const { issuer, ...rest } = config;
    return {
        id: "mattermost",
        name: "Mattermost",
        type: "oauth",
        client: { token_endpoint_auth_method: "client_secret_post" },
        token: `${issuer}/oauth/access_token`,
        authorization: `${issuer}/oauth/authorize`,
        userinfo: `${issuer}/api/v4/users/me`,
        profile(profile) {
            return {
                id: profile.id,
                name: profile.username ?? `${profile.first_name} ${profile.last_name}`,
                email: profile.email,
                image: null,
            };
        },
        style: { bg: "#000", text: "#fff" },
        options: rest,
    };
}
