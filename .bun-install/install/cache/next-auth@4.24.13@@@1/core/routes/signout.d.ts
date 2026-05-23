import type { InternalOptions } from "../types";
import type { ResponseInternal } from "..";
import type { SessionStore } from "../lib/cookie";
/** Handle requests to /api/auth/signout */
export default function signout(params: {
    options: InternalOptions;
    sessionStore: SessionStore;
}): Promise<ResponseInternal>;
//# sourceMappingURL=signout.d.ts.map