/**
 * <div class="provider" style={{backgroundColor: "#ffcc00", display: "flex", justifyContent: "space-between", color: "#000", padding: 16}}>
 * <span>Built-in <b>Yandex</b> integration.</span>
 * <a href="https://yandex.com">
 *   <img style={{display: "block"}} src="https://authjs.dev/img/providers/yandex.svg" height="48" width="48"/>
 * </a>
 * </div>
 *
 * @module providers/yandex
 */
/**
 * Add Yandex login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/yandex
 * ```
 *
 * #### Configuration
 * ```ts
 * import { Auth } from "@auth/core"
 * import Yandex from "@auth/core/providers/yandex"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Yandex({ clientId: YANDEX_CLIENT_ID, clientSecret: YANDEX_CLIENT_SECRET }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 * - [Yandex - Creating an OAuth app](https://yandex.com/dev/id/doc/en/register-client#create)
 * - [Yandex - Manage OAuth apps](https://oauth.yandex.com/)
 * - [Yandex - OAuth documentation](https://yandex.com/dev/id/doc/en/)
 * - [Learn more about OAuth](https://authjs.dev/concepts/oauth)
 * - [Source code](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/yandex.ts)
 *
 *:::tip
 * The Yandex provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/yandex.ts).
 * To override the defaults for your use case, check out [customizing a built-in OAuth provider](https://authjs.dev/guides/configuring-oauth-providers).
 * :::
 *
 * :::info **Disclaimer**
 * If you think you found a bug in the default configuration, you can [open an issue](https://authjs.dev/new/provider-issue).
 *
 * Auth.js strictly adheres to the specification and it cannot take responsibility for any deviation from
 * the spec by the provider. You can open an issue, but if the problem is non-compliance with the spec,
 * we might not pursue a resolution. You can ask for more help in [Discussions](https://authjs.dev/new/github-discussions).
 * :::
 */
export default function Yandex(options) {
    return {
        id: "yandex",
        name: "Yandex",
        type: "oauth",
        /** @see [Data access](https://yandex.com/dev/id/doc/en/register-client#access) */
        authorization: "https://oauth.yandex.ru/authorize?scope=login:info+login:email+login:avatar",
        token: "https://oauth.yandex.ru/token",
        userinfo: "https://login.yandex.ru/info?format=json",
        profile(profile) {
            return {
                id: profile.id,
                name: profile.display_name ?? profile.real_name ?? profile.first_name,
                email: profile.default_email ?? profile.emails?.[0] ?? null,
                image: !profile.is_avatar_empty && profile.default_avatar_id
                    ? `https://avatars.yandex.net/get-yapic/${profile.default_avatar_id}/islands-200`
                    : null,
            };
        },
        style: {
            bg: "#ffcc00",
            text: "#000",
        },
        options,
    };
}
