import * as o from "oauth4webapi";
import type { InternalOptions, Profile, RequestInternal } from "../../../../types.js";
import type { Cookie } from "../../../utils/cookie.js";
/**
 * Handles the following OAuth steps.
 * https://www.rfc-editor.org/rfc/rfc6749#section-4.1.1
 * https://www.rfc-editor.org/rfc/rfc6749#section-4.1.3
 * https://openid.net/specs/openid-connect-core-1_0.html#UserInfoRequest
 *
 * @note Although requesting userinfo is not required by the OAuth2.0 spec,
 * we fetch it anyway. This is because we always want a user profile.
 */
export declare function handleOAuth(params: RequestInternal["query"], cookies: RequestInternal["cookies"], options: InternalOptions<"oauth" | "oidc">): Promise<{
    profile: Profile;
    cookies: Cookie[];
    user?: {
        id: `${string}-${string}-${string}-${string}-${string}`;
        email: string | undefined;
        name?: string | null | undefined;
        image?: string | null | undefined;
    } | undefined;
    account?: {
        provider: string;
        type: "oauth" | "oidc";
        providerAccountId: string;
        access_token?: string | undefined;
        expires_in?: number | undefined;
        id_token?: string | undefined;
        refresh_token?: string | undefined;
        scope?: string | undefined;
        authorization_details?: o.AuthorizationDetails[] | undefined;
        token_type?: "bearer" | "dpop" | Lowercase<string> | undefined;
        expires_at?: number | undefined;
    } | undefined;
}>;
//# sourceMappingURL=callback.d.ts.map