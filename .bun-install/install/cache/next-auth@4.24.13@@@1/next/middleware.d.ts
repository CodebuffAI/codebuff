import type { NextMiddleware, NextFetchEvent } from "next/server";
import type { Awaitable, CookieOption, AuthOptions } from "..";
import type { JWT, JWTOptions } from "../jwt";
import { NextRequest } from "next/server";
declare type AuthorizedCallback = (params: {
    token: JWT | null;
    req: NextRequest;
}) => Awaitable<boolean>;
export interface NextAuthMiddlewareOptions {
    /**
     * Where to redirect the user in case of an error if they weren't logged in.
     * Similar to `pages` in `NextAuth`.
     *
     * ---
     * [Documentation](https://next-auth.js.org/configuration/pages)
     */
    pages?: AuthOptions["pages"];
    /**
     * You can override the default cookie names and options for any of the cookies
     * by this middleware. Similar to `cookies` in `NextAuth`.
     *
     * Useful if the token is stored in not a default cookie.
     *
     * ---
     * [Documentation](https://next-auth.js.org/configuration/options#cookies)
     *
     * - ⚠ **This is an advanced option.** Advanced options are passed the same way as basic options,
     * but **may have complex implications** or side effects.
     * You should **try to avoid using advanced options** unless you are very comfortable using them.
     *
     */
    cookies?: Partial<Record<keyof Pick<keyof AuthOptions["cookies"], "sessionToken">, Omit<CookieOption, "options">>>;
    /**
     * If a custom jwt `decode` method is set in `[...nextauth].ts`, the same method should be set here also.
     *
     * ---
     * [Documentation](https://next-auth.js.org/configuration/nextjs#custom-jwt-decode-method)
     */
    jwt?: Partial<Pick<JWTOptions, "decode">>;
    callbacks?: {
        /**
         * Callback that receives the user's JWT payload
         * and returns `true` to allow the user to continue.
         *
         * This is similar to the `signIn` callback in `NextAuthOptions`.
         *
         * If it returns `false`, the user is redirected to the sign-in page instead
         *
         * The default is to let the user continue if they have a valid JWT (basic authentication).
         *
         * How to restrict a page and all of it's subpages for admins-only:
         * @example
         *
         * ```js
         * // `middleware.js`
         * import { withAuth } from "next-auth/middleware"
         *
         * export default withAuth({
         *   callbacks: {
         *     authorized: ({ token }) => token?.user.isAdmin
         *   }
         * })
         *
         * export const config = { matcher: ["/admin"] }
         *
         * ```
         *
         * ---
         * [Documentation](https://next-auth.js.org/configuration/nextjs#middleware) | [`signIn` callback](configuration/callbacks#sign-in-callback)
         */
        authorized?: AuthorizedCallback;
    };
    /**
     * The same `secret` used in the `NextAuth` configuration.
     * Defaults to the `NEXTAUTH_SECRET` environment variable.
     */
    secret?: string;
}
declare type NextMiddlewareResult = ReturnType<NextMiddleware> | void;
export interface NextRequestWithAuth extends NextRequest {
    nextauth: {
        token: JWT | null;
    };
}
export declare type NextMiddlewareWithAuth = (request: NextRequestWithAuth, event: NextFetchEvent) => NextMiddlewareResult | Promise<NextMiddlewareResult>;
export declare type WithAuthArgs = [NextRequestWithAuth] | [NextRequestWithAuth, NextFetchEvent] | [NextRequestWithAuth, NextAuthMiddlewareOptions] | [NextMiddlewareWithAuth] | [NextMiddlewareWithAuth, NextAuthMiddlewareOptions] | [NextAuthMiddlewareOptions] | [];
/**
 * Middleware that checks if the user is authenticated/authorized.
 * If if they aren't, they will be redirected to the login page.
 * Otherwise, continue.
 *
 * @example
 *
 * ```js
 * // `middleware.js`
 * export { default } from "next-auth/middleware"
 * ```
 *
 * ---
 * [Documentation](https://next-auth.js.org/configuration/nextjs#middleware)
 */
export declare function withAuth(): ReturnType<NextMiddlewareWithAuth>;
export declare function withAuth(req: NextRequestWithAuth): ReturnType<NextMiddlewareWithAuth>;
export declare function withAuth(req: NextRequestWithAuth, event: NextFetchEvent): ReturnType<NextMiddlewareWithAuth>;
export declare function withAuth(req: NextRequestWithAuth, options: NextAuthMiddlewareOptions): ReturnType<NextMiddlewareWithAuth>;
export declare function withAuth(middleware: NextMiddlewareWithAuth, options: NextAuthMiddlewareOptions): NextMiddlewareWithAuth;
export declare function withAuth(middleware: NextMiddlewareWithAuth): NextMiddlewareWithAuth;
export declare function withAuth(options: NextAuthMiddlewareOptions): NextMiddlewareWithAuth;
export default withAuth;
//# sourceMappingURL=middleware.d.ts.map