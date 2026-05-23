import type { InternalOptions, ResponseInternal } from "../../types.js";
import type { Cookie, SessionStore } from "../utils/cookie.js";
/**
 * Destroys the session.
 * If the session strategy is database,
 * The session is also deleted from the database.
 * In any case, the session cookie is cleared and
 * {@link AuthConfig["events"].signOut} is emitted.
 */
export declare function signOut(cookies: Cookie[], sessionStore: SessionStore, options: InternalOptions): Promise<ResponseInternal>;
//# sourceMappingURL=signout.d.ts.map