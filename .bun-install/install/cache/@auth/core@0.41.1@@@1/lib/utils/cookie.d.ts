import type { CookieOption, LoggerInstance, RequestInternal } from "../../types.js";
/** Stringified form of `JWT`. Extract the content with `jwt.decode` */
export type JWTString = string;
export type SetCookieOptions = Partial<CookieOption["options"]> & {
    expires?: Date | string;
    encode?: (val: unknown) => string;
};
/**
 * If `options.session.strategy` is set to `jwt`, this is a stringified `JWT`.
 * In case of `strategy: "database"`, this is the `sessionToken` of the session in the database.
 */
export type SessionToken<T extends "jwt" | "database" = "jwt"> = T extends "jwt" ? JWTString : string;
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
export declare function defaultCookies(useSecureCookies: boolean): {
    readonly sessionToken: {
        readonly name: "__Secure-authjs.session-token" | "authjs.session-token";
        readonly options: {
            readonly httpOnly: true;
            readonly sameSite: "lax";
            readonly path: "/";
            readonly secure: boolean;
        };
    };
    readonly callbackUrl: {
        readonly name: "__Secure-authjs.callback-url" | "authjs.callback-url";
        readonly options: {
            readonly httpOnly: true;
            readonly sameSite: "lax";
            readonly path: "/";
            readonly secure: boolean;
        };
    };
    readonly csrfToken: {
        readonly name: "authjs.csrf-token" | "__Host-authjs.csrf-token";
        readonly options: {
            readonly httpOnly: true;
            readonly sameSite: "lax";
            readonly path: "/";
            readonly secure: boolean;
        };
    };
    readonly pkceCodeVerifier: {
        readonly name: "__Secure-authjs.pkce.code_verifier" | "authjs.pkce.code_verifier";
        readonly options: {
            readonly httpOnly: true;
            readonly sameSite: "lax";
            readonly path: "/";
            readonly secure: boolean;
            readonly maxAge: number;
        };
    };
    readonly state: {
        readonly name: "__Secure-authjs.state" | "authjs.state";
        readonly options: {
            readonly httpOnly: true;
            readonly sameSite: "lax";
            readonly path: "/";
            readonly secure: boolean;
            readonly maxAge: number;
        };
    };
    readonly nonce: {
        readonly name: "__Secure-authjs.nonce" | "authjs.nonce";
        readonly options: {
            readonly httpOnly: true;
            readonly sameSite: "lax";
            readonly path: "/";
            readonly secure: boolean;
        };
    };
    readonly webauthnChallenge: {
        readonly name: "__Secure-authjs.challenge" | "authjs.challenge";
        readonly options: {
            readonly httpOnly: true;
            readonly sameSite: "lax";
            readonly path: "/";
            readonly secure: boolean;
            readonly maxAge: number;
        };
    };
};
export interface Cookie extends CookieOption {
    value: string;
}
export declare class SessionStore {
    #private;
    constructor(option: CookieOption, cookies: RequestInternal["cookies"], logger: LoggerInstance | Console);
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