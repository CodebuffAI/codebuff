import { AuthOptions } from "..";
import * as cookie from "./lib/cookie";
import { RequestInternal } from ".";
import type { InternalOptions } from "./types";
interface InitParams {
    origin?: string;
    authOptions: AuthOptions;
    providerId?: string;
    action: InternalOptions["action"];
    /** Callback URL value extracted from the incoming request. */
    callbackUrl?: string;
    /** CSRF token value extracted from the incoming request. From body if POST, from query if GET */
    csrfToken?: string;
    /** Is the incoming request a POST request? */
    isPost: boolean;
    cookies: RequestInternal["cookies"];
}
/** Initialize all internal options and cookies. */
export declare function init({ authOptions, providerId, action, origin, cookies: reqCookies, callbackUrl: reqCallbackUrl, csrfToken: reqCsrfToken, isPost, }: InitParams): Promise<{
    options: InternalOptions;
    cookies: cookie.Cookie[];
}>;
export {};
//# sourceMappingURL=init.d.ts.map