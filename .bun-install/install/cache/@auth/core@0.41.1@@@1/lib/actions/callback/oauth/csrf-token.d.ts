import type { AuthAction, InternalOptions } from "../../../../types.js";
interface CreateCSRFTokenParams {
    options: InternalOptions;
    cookieValue?: string;
    isPost: boolean;
    bodyValue?: string;
}
/**
 * Ensure CSRF Token cookie is set for any subsequent requests.
 * Used as part of the strategy for mitigation for CSRF tokens.
 *
 * Creates a cookie like 'next-auth.csrf-token' with the value 'token|hash',
 * where 'token' is the CSRF token and 'hash' is a hash made of the token and
 * the secret, and the two values are joined by a pipe '|'. By storing the
 * value and the hash of the value (with the secret used as a salt) we can
 * verify the cookie was set by the server and not by a malicious attacker.
 *
 * For more details, see the following OWASP links:
 * https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#double-submit-cookie
 * https://owasp.org/www-chapter-london/assets/slides/David_Johansson-Double_Defeat_of_Double-Submit_Cookie.pdf
 */
export declare function createCSRFToken({ options, cookieValue, isPost, bodyValue, }: CreateCSRFTokenParams): Promise<{
    csrfTokenVerified: boolean;
    csrfToken: string;
    cookie?: undefined;
} | {
    cookie: string;
    csrfToken: string;
    csrfTokenVerified?: undefined;
}>;
export declare function validateCSRF(action: AuthAction, verified?: boolean): void;
export {};
//# sourceMappingURL=csrf-token.d.ts.map