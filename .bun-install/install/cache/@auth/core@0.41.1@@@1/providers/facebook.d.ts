/**
 * <div class="provider" style={{backgroundColor: "#000", display: "flex", justifyContent: "space-between", color: "#fff", padding: 16}}>
 * <span>Built-in <b>Facebook</b> integration.</span>
 * <a href="https://facebook.com">
 *   <img style={{display: "block"}} src="https://authjs.dev/img/providers/facebook.svg" height="48" width="48"/>
 * </a>
 * </div>
 *
 * @module providers/facebook
 */
import type { OAuthConfig, OAuthUserConfig } from "./index.js";
interface FacebookPictureData {
    url: string;
}
interface FacebookPicture {
    data: FacebookPictureData;
}
export interface FacebookProfile extends Record<string, any> {
    id: string;
    picture: FacebookPicture;
}
/**
 * Add Facebook login to your page.
 *
 * ### Setup
 *
 * #### Callback URL
 * ```
 * https://example.com/api/auth/callback/facebook
 * ```
 *
 * #### Configuration
 *```ts
 * import { Auth } from "@auth/core"
 * import Facebook from "@auth/core/providers/facebook"
 *
 * const request = new Request(origin)
 * const response = await Auth(request, {
 *   providers: [
 *     Facebook({
 *       clientId: FACEBOOK_CLIENT_ID,
 *       clientSecret: FACEBOOK_CLIENT_SECRET,
 *     }),
 *   ],
 * })
 * ```
 *
 * ### Resources
 *
 *  - [Facebook OAuth documentation](https://developers.facebook.com/docs/facebook-login/manually-build-a-login-flow/)
 *
 * ### Notes
 *
 * :::tip
 * Production applications cannot use localhost URLs to sign in with Facebook. You need to use a dedicated development application in Facebook to use localhost callback URLs.
 * :::
 *
 * :::tip
 * Email address may not be returned for accounts created on mobile.
 * :::
 *
 * By default, Auth.js assumes that the Facebook provider is
 * based on the [OAuth 2](https://www.rfc-editor.org/rfc/rfc6749.html) specification.
 *
 * :::tip
 *
 * The Facebook provider comes with a [default configuration](https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/providers/facebook.ts).
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
export default function Facebook<P extends FacebookProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
export {};
//# sourceMappingURL=facebook.d.ts.map