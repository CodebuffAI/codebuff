import type { InternalOptions, User } from "../../types.js";
import type { SessionStore } from "./cookie.js";
/**
 * Returns the currently logged in user, if any.
 */
export declare function getLoggedInUser(options: InternalOptions, sessionStore: SessionStore): Promise<User | null>;
//# sourceMappingURL=session.d.ts.map