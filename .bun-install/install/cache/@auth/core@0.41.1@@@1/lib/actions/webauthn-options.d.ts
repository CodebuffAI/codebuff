import type { InternalOptions, RequestInternal, ResponseInternal } from "../../types.js";
import type { Cookie, SessionStore } from "../utils/cookie.js";
/**
 * Returns authentication or registration options for a WebAuthn flow
 * depending on the parameters provided.
 */
export declare function webAuthnOptions(request: RequestInternal, options: InternalOptions, sessionStore: SessionStore, cookies: Cookie[]): Promise<ResponseInternal>;
//# sourceMappingURL=webauthn-options.d.ts.map