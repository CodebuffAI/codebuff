/**
 * @param {import("../core").Provider} options
 * @example
 *
 * ```js
 * // pages/api/auth/[...nextauth].js
 * import Providers from `next-auth/providers`
 * ...
 * providers: [
 *   Providers.Dropbox({
 *     clientId: process.env.DROPBOX_CLIENT_ID,
 *     clientSecret: process.env.DROPBOX_CLIENT_SECRET
 *   })
 * ]
 * ...
 *
 * // pages/index
 * import { signIn } from "next-auth/react"
 * ...
 * <button onClick={() => signIn("dropbox")}>
 *   Sign in
 * </button>
 * ...
 * ```
 * *Resources:*
 * - [NextAuth.js Documentation](https://next-auth.js.org/providers/dropbox)
 * - [Dropbox Documentation](https://developers.dropbox.com/oauth-guide)
 * - [Configuration](https://www.dropbox.com/developers/apps)
 */
/** @type {import(".").OAuthProvider} */
export default function Dropbox(options: Partial<import("./oauth").OAuthConfig<any>>): import("./oauth").OAuthConfig<any>;
//# sourceMappingURL=dropbox.d.ts.map