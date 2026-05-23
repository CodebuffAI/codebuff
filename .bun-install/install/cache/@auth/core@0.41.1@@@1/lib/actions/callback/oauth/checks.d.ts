import type { InternalOptions, RequestInternal, User } from "../../../../types.js";
import type { Cookie } from "../../../utils/cookie.js";
import type { WebAuthnProviderType } from "../../../../providers/webauthn.js";
/**
 * @see https://www.rfc-editor.org/rfc/rfc7636
 * @see https://danielfett.de/2020/05/16/pkce-vs-nonce-equivalent-or-not/#pkce
 */
export declare const pkce: {
    /** Creates a PKCE code challenge and verifier pair. The verifier in stored in the cookie. */
    create(options: InternalOptions<"oauth">): Promise<{
        cookie: Cookie;
        value: string;
    }>;
    /**
     * Returns code_verifier if the provider is configured to use PKCE,
     * and clears the container cookie afterwards.
     * An error is thrown if the code_verifier is missing or invalid.
     */
    use: (cookies: RequestInternal["cookies"], resCookies: Cookie[], options: InternalOptions<"oidc">) => Promise<string | undefined>;
};
interface EncodedState {
    origin?: string;
    random: string;
}
/**
 * @see https://www.rfc-editor.org/rfc/rfc6749#section-10.12
 * @see https://www.rfc-editor.org/rfc/rfc6749#section-4.1.1
 */
export declare const state: {
    /** Creates a state cookie with an optionally encoded body. */
    create(options: InternalOptions<"oauth">, origin?: string): Promise<{
        cookie: Cookie;
        value: string;
    } | undefined>;
    /**
     * Returns state if the provider is configured to use state,
     * and clears the container cookie afterwards.
     * An error is thrown if the state is missing or invalid.
     */
    use: (cookies: RequestInternal["cookies"], resCookies: Cookie[], options: InternalOptions<"oidc">) => Promise<string | undefined>;
    /** Decodes the state. If it could not be decoded, it throws an error. */
    decode(state: string, options: InternalOptions): Promise<EncodedState>;
};
export declare const nonce: {
    create(options: InternalOptions<"oidc">): Promise<{
        cookie: Cookie;
        value: string;
    } | undefined>;
    /**
     * Returns nonce if the provider is configured to use nonce,
     * and clears the container cookie afterwards.
     * An error is thrown if the nonce is missing or invalid.
     * @see https://openid.net/specs/openid-connect-core-1_0.html#NonceNotes
     * @see https://danielfett.de/2020/05/16/pkce-vs-nonce-equivalent-or-not/#nonce
     */
    use: (cookies: RequestInternal["cookies"], resCookies: Cookie[], options: InternalOptions<"oidc">) => Promise<string | undefined>;
};
interface WebAuthnChallengePayload {
    challenge: string;
    registerData?: User;
}
export declare const webauthnChallenge: {
    create(options: InternalOptions<WebAuthnProviderType>, challenge: string, registerData?: User): Promise<{
        cookie: Cookie;
    }>;
    /** Returns WebAuthn challenge if present. */
    use(options: InternalOptions<WebAuthnProviderType>, cookies: RequestInternal["cookies"], resCookies: Cookie[]): Promise<WebAuthnChallengePayload>;
};
export {};
//# sourceMappingURL=checks.d.ts.map