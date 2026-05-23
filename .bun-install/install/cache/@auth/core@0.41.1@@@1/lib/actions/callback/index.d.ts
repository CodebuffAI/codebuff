import type { InternalOptions, RequestInternal, ResponseInternal } from "../../../types.js";
import type { Cookie, SessionStore } from "../../utils/cookie.js";
/** Handle callbacks from login services */
export declare function callback(request: RequestInternal, options: InternalOptions, sessionStore: SessionStore, cookies: Cookie[]): Promise<ResponseInternal>;
//# sourceMappingURL=index.d.ts.map