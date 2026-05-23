/**
 * Add VK login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/vk
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import VK from "@auth/core/providers/vk"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [VK({ clientId: VK_CLIENT_ID, clientSecret: VK_CLIENT_SECRET })],
 * })
 * ```
 *
 * ### Resources
 *
 * - [VK API documentation](https://vk.com/dev/first_guide)
 * - [VK App configuration](https://vk.com/apps?act=manage)
 *
 * ### Notes
 *
 * By default, Auth.js assumes that the VK provider is
 * based on the [OAuth 2](https://www.rfc-editor.org/rfc/rfc6749.html) specification.
 *
 * :::tip
 *
 * The VK provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/vk.ts).
 * To override the defaults for your use case, check out [customizing a built-in OAuth provider](https://authjs.dev/guides/configuring-oauth-providers).
 *
 * :::
 *
 * :::note
 *
 * By default the provider uses 5.126 version of the API. See https://vk.com/dev/versions for more info.
 * If you want to use a different version, you can pass it to provider's options object:
 * ```ts
 * const apiVersion = "5.126"
 * providers: [
 *   Vk({
 *     accessTokenUrl: `https://oauth.vk.com/access_token?v=${apiVersion}`,
 *     requestTokenUrl: `https://oauth.vk.com/access_token?v=${apiVersion}`,
 *     authorizationUrl:
 *       `https://oauth.vk.com/authorize?response_type=code&v=${apiVersion}`,
 *     profileUrl: `https://api.vk.com/method/users.get?fields=photo_100&v=${apiVersion}`,
 *   })
 * ]
 * ```
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
export default function VK(options) {
    const apiVersion = "5.131"; // https://vk.com/dev/versions
    return {
        id: "vk",
        name: "VK",
        type: "oauth",
        authorization: `https://oauth.vk.com/authorize?scope=email&v=${apiVersion}`,
        client: {
            token_endpoint_auth_method: "client_secret_post",
        },
        token: `https://oauth.vk.com/access_token?v=${apiVersion}`,
        userinfo: {
            url: `https://api.vk.com/method/users.get?fields=photo_100&v=${apiVersion}`,
            async request({ tokens, provider }) {
                const profile = await fetch(provider.userinfo?.url, {
                    headers: {
                        Authorization: `Bearer ${tokens.access_token}`,
                        "User-Agent": "authjs",
                    },
                }).then(async (res) => await res.json());
                profile.response[0].email = tokens.email ? tokens.email : null;
                return profile.response[0];
            },
        },
        profile(profile) {
            return {
                id: profile.id,
                name: [profile.first_name, profile.last_name].filter(Boolean).join(" "),
                email: profile.email ?? null,
                image: profile.photo_100,
            };
        },
        style: { bg: "#07F", text: "#fff" },
        options,
    };
}
