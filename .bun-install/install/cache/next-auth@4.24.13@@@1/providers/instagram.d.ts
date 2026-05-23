/**
 * @type {import("src/providers").OAuthProvider} options
 * @example
 *
 * ```js
 * // pages/api/auth/[...nextauth].js
 * import Providers from `next-auth/providers`
 * ...
 * providers: [
 *   Providers.Instagram({
 *     clientId: process.env.INSTAGRAM_CLIENT_ID,
 *     clientSecret: process.env.INSTAGRAM_CLIENT_SECRET
 *   })
 * ]
 * ...
 *
 * // pages/index
 * import { signIn } from "next-auth/react"
 * ...
 * <button onClick={() => signIn("instagram")}>
 *   Sign in
 * </button>
 * ...
 * ```
 * [NextAuth.js Documentation](https://next-auth.js.org/providers/instagram) | [Instagram Documentation](https://developers.facebook.com/docs/instagram-basic-display-api/getting-started) | [Configuration](https://developers.facebook.com/apps)
 */
/** @type {import(".").OAuthProvider} */
export default function Instagram(options: Partial<import("src/providers").OAuthConfig<any>>): import("src/providers").OAuthConfig<any>;
//# sourceMappingURL=instagram.d.ts.map