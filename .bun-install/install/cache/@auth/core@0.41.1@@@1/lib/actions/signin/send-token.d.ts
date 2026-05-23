import type { InternalOptions, RequestInternal } from "../../../types.js";
/**
 * Starts an e-mail login flow, by generating a token,
 * and sending it to the user's e-mail (with the help of a DB adapter).
 * At the end, it returns a redirect to the `verify-request` page.
 */
export declare function sendToken(request: RequestInternal, options: InternalOptions<"email">): Promise<{
    redirect: string;
}>;
//# sourceMappingURL=send-token.d.ts.map