/**
 * Add 42School login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/42-school
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import FortyTwoSchool from "@auth/core/providers/42-school"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     FortyTwoSchool({
 *       clientId: FORTY_TWO_SCHOOL_CLIENT_ID,
 *       clientSecret: FORTY_TWO_SCHOOL_CLIENT_SECRET,
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 *  - [42School OAuth documentation](https://api.intra.42.fr/apidoc/guides/web_application_flow)
 *
 * ### Notes
 *
 *
 * :::note
 * 42 returns a field on `Account` called `created_at` which is a number. See the [docs](https://api.intra.42.fr/apidoc/guides/getting_started#make-basic-requests). Make sure to add this field to your database schema, in case if you are using an [Adapter](https://authjs.dev/reference/core/adapters).
 * :::
 * By default, Auth.js assumes that the 42School provider is
 * based on the [OAuth 2](https://www.rfc-editor.org/rfc/rfc6749.html) specification.
 *
 * :::tip
 *
 * The 42School provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/42-school.ts).
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
export default function FortyTwo(options) {
    return {
        id: "42-school",
        name: "42 School",
        type: "oauth",
        authorization: {
            url: "https://api.intra.42.fr/oauth/authorize",
            params: { scope: "public" },
        },
        token: "https://api.intra.42.fr/oauth/token",
        userinfo: "https://api.intra.42.fr/v2/me",
        profile(profile) {
            return {
                id: profile.id.toString(),
                name: profile.usual_full_name,
                email: profile.email,
                image: profile.image.link,
            };
        },
        options,
    };
}
