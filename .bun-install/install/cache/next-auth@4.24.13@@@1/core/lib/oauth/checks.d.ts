import { AuthorizationParameters, OpenIDCallbackChecks } from "openid-client";
import type { RequestInternal } from "../..";
import type { OAuthChecks } from "../../../providers";
import type { CookiesOptions, InternalOptions } from "../../types";
import type { Cookie } from "../cookie";
/** Returns a signed cookie. */
export declare function signCookie(type: keyof CookiesOptions, value: string, maxAge: number, options: InternalOptions<"oauth">): Promise<Cookie>;
export declare const PKCE_CODE_CHALLENGE_METHOD = "S256";
export declare const pkce: {
    create(options: InternalOptions<"oauth">, cookies: Cookie[], resParams: AuthorizationParameters): Promise<void>;
    /**
     * Returns code_verifier if the provider is configured to use PKCE,
     * and clears the container cookie afterwards.
     * An error is thrown if the code_verifier is missing or invalid.
     * @see https://www.rfc-editor.org/rfc/rfc7636
     * @see https://danielfett.de/2020/05/16/pkce-vs-nonce-equivalent-or-not/#pkce
     */
    use(cookies: RequestInternal["cookies"], resCookies: Cookie[], options: InternalOptions<"oauth">, checks: OAuthChecks): Promise<string | undefined>;
};
export declare const state: {
    create(options: InternalOptions<"oauth">, cookies: Cookie[], resParams: AuthorizationParameters): Promise<void>;
    /**
     * Returns state if the provider is configured to use state,
     * and clears the container cookie afterwards.
     * An error is thrown if the state is missing or invalid.
     * @see https://www.rfc-editor.org/rfc/rfc6749#section-10.12
     * @see https://www.rfc-editor.org/rfc/rfc6749#section-4.1.1
     */
    use(cookies: RequestInternal["cookies"], resCookies: Cookie[], options: InternalOptions<"oauth">, checks: OAuthChecks): Promise<void>;
};
export declare const nonce: {
    create(options: InternalOptions<"oauth">, cookies: Cookie[], resParams: AuthorizationParameters): Promise<void>;
    /**
     * Returns nonce if the provider is configured to use nonce,
     * and clears the container cookie afterwards.
     * An error is thrown if the nonce is missing or invalid.
     * @see https://openid.net/specs/openid-connect-core-1_0.html#NonceNotes
     * @see https://danielfett.de/2020/05/16/pkce-vs-nonce-equivalent-or-not/#nonce
     */
    use(cookies: RequestInternal["cookies"], resCookies: Cookie[], options: InternalOptions<"oauth">, checks: OpenIDCallbackChecks): Promise<string | undefined>;
};
//# sourceMappingURL=checks.d.ts.map