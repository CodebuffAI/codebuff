import type { CookiesOptions } from "../..";
import type { CookieOption, LoggerInstance, SessionStrategy } from "../types";
import type { NextRequest } from "next/server";
import type { NextApiRequest } from "next";
/** Stringified form of `JWT`. Extract the content with `jwt.decode` */
export declare type JWTString = string;
export declare type SetCookieOptions = Partial<CookieOption["options"]> & {
    expires?: Date | string;
    encode?: (val: unknown) => string;
};
/**
 * If `options.session.strategy` is set to `jwt`, this is a stringified `JWT`.
 * In case of `strategy: "database"`, this is the `sessionToken` of the session in the database.
 */
export declare type SessionToken<T extends SessionStrategy = "jwt"> = T extends "jwt" ? JWTString : string;
/**
 * Use secure cookies if the site uses HTTPS
 * This being conditional allows cookies to work non-HTTPS development URLs
 * Honour secure cookie option, which sets 'secure' and also adds '__Secure-'
 * prefix, but enable them by default if the site URL is HTTPS; but not for
 * non-HTTPS URLs like http://localhost which are used in development).
 * For more on prefixes see https://googlechrome.github.io/samples/cookie-prefixes/
 *
 * @TODO Review cookie settings (names, options)
 */
export declare function defaultCookies(useSecureCookies: boolean): CookiesOptions;
export interface Cookie extends CookieOption {
    value: string;
}
export declare class SessionStore {
    #private;
    constructor(option: CookieOption, req: Partial<{
        cookies: NextRequest["cookies"] | NextApiRequest["cookies"];
        headers: NextRequest["headers"] | NextApiRequest["headers"];
    }>, logger: LoggerInstance | Console);
    /**
     * The JWT Session or database Session ID
     * constructed from the cookie chunks.
     */
    get value(): string;
    /**
     * Given a cookie value, return new cookies, chunked, to fit the allowed cookie size.
     * If the cookie has changed from chunked to unchunked or vice versa,
     * it deletes the old cookies as well.
     */
    chunk(value: string, options: Partial<Cookie["options"]>): Cookie[];
    /** Returns a list of cookies that should be cleaned. */
    clean(): Cookie[];
}
//# sourceMappingURL=cookie.d.ts.map