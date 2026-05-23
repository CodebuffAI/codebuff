import type { InternalOptions } from "../types";
interface CreateCallbackUrlParams {
    options: InternalOptions;
    /** Try reading value from request body (POST) then from query param (GET) */
    paramValue?: string;
    cookieValue?: string;
}
/**
 * Get callback URL based on query param / cookie + validation,
 * and add it to `req.options.callbackUrl`.
 */
export declare function createCallbackUrl({ options, paramValue, cookieValue, }: CreateCallbackUrlParams): Promise<{
    callbackUrl: string;
    callbackUrlCookie: string | undefined;
}>;
export {};
//# sourceMappingURL=callback-url.d.ts.map