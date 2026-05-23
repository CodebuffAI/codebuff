import type { InternalOptions, ResponseInternal, Session } from "../../types.js";
import type { Cookie, SessionStore } from "../utils/cookie.js";
/** Return a session object filtered via `callbacks.session` */
export declare function session(options: InternalOptions, sessionStore: SessionStore, cookies: Cookie[], isUpdate?: boolean, newSession?: any): Promise<ResponseInternal<Session | null>>;
//# sourceMappingURL=session.d.ts.map