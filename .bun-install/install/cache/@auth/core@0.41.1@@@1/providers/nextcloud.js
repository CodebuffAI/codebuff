/**
 * <div class="provider" style={{backgroundColor: "#0082C9", display: "flex", justifyContent: "space-between", color: "#fff", padding: 16}}>
 * <span>Built-in <b>Nextcloud</b> integration.</span>
 * <a href="https://nextcloud.com">
 *   <img style={{display: "block"}} src="https://authjs.dev/img/providers/nextcloud.svg" height="48" width="48"/>
 * </a>
 * </div>
 *
 * @module providers/nextcloud
 */
/**
 * Add Nextcloud login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/auth/callback/nextcloud
 * ```
 *
 * #### Configuration
 * ```ts
 * import { Auth } from "@auth/core"
 * import Nextcloud from "@auth/core/providers/nextcloud"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Nextcloud({ clientId: AUTH_NEXTCLOUD_ID, clientSecret: AUTH_NEXTCLOUD_SECRET, issuer: AUTH_NEXTCLOUD_ISSUER }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 * - [Nextcloud Documentation](https://docs.nextcloud.com/)
 * - [Nextcloud OAuth 2](https://docs.nextcloud.com/server/latest/admin_manual/configuration_server/oauth2.html)
 * - [Nextcloud Clients and Client APIs](https://docs.nextcloud.com/server/latest/developer_manual/client_apis/index.html)
 * - [Nextcloud User provisioning API](https://docs.nextcloud.com/server/latest/admin_manual/configuration_user/user_provisioning_api.html)
 *
 * ### Notes
 *
 * By default, Auth.js assumes that the Nextcloud provider is
 * based on the [OAuth 2](https://www.rfc-editor.org/rfc/rfc6749.html) specification.
 *
 * :::tip
 *
 * The Nextcloud provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/nextcloud.ts).
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
export default function Nextcloud(options) {
    return {
        id: "nextcloud",
        name: "Nextcloud",
        type: "oauth",
        authorization: `${options.issuer}/apps/oauth2/authorize`,
        token: `${options.issuer}/apps/oauth2/api/v1/token`,
        userinfo: {
            url: `${options.issuer}/ocs/v1.php/cloud/users`,
            async request({ tokens, provider }) {
                const url = `${provider.userinfo?.url}/${tokens.user_id}`;
                const res = await fetch(url, {
                    headers: {
                        "OCS-APIRequest": "true",
                        Authorization: `Bearer ${tokens.access_token}`,
                        Accept: "application/json",
                    },
                }).then((res) => res.json());
                return res.ocs.data;
            },
        },
        profile(profile) {
            return {
                id: profile.id,
                name: profile.displayname,
                email: profile.email,
                image: `${options.issuer}/avatar/${profile.id}/512`,
            };
        },
        style: {
            logo: "/nextcloud.svg",
            bg: "#fff",
            text: "#0082C9",
        },
        options,
    };
}
