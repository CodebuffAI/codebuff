import type { RequestInternal, ResponseInternal } from "..";
import type { InternalOptions } from "../types";
/** Handle requests to /api/auth/signin */
export default function signin(params: {
    options: InternalOptions<"oauth" | "email">;
    query: RequestInternal["query"];
    body: RequestInternal["body"];
}): Promise<ResponseInternal>;
//# sourceMappingURL=signin.d.ts.map