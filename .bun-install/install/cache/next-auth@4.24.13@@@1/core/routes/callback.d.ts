import type { InternalOptions } from "../types";
import type { RequestInternal, ResponseInternal } from "..";
import type { SessionStore } from "../lib/cookie";
/** Handle callbacks from login services */
export default function callback(params: {
    options: InternalOptions;
    query: RequestInternal["query"];
    method: Required<RequestInternal>["method"];
    body: RequestInternal["body"];
    headers: RequestInternal["headers"];
    cookies: RequestInternal["cookies"];
    sessionStore: SessionStore;
}): Promise<ResponseInternal>;
//# sourceMappingURL=callback.d.ts.map