import type { InternalOptions, RequestInternal } from "../../../types.js";
import type { Cookie } from "../../utils/cookie.js";
/**
 * Generates an authorization/request token URL.
 *
 * [OAuth 2](https://www.oauth.com/oauth2-servers/authorization/the-authorization-request/)
 */
export declare function getAuthorizationUrl(query: RequestInternal["query"], options: InternalOptions<"oauth" | "oidc">): Promise<{
    redirect: string;
    cookies: Cookie[];
}>;
//# sourceMappingURL=authorization-url.d.ts.map