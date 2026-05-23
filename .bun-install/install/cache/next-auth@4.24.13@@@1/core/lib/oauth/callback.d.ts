import { TokenSet } from "openid-client";
import type { LoggerInstance, Profile } from "../../..";
import type { OAuthConfig } from "../../../providers";
import type { InternalOptions } from "../../types";
import type { RequestInternal } from "../..";
import type { Cookie } from "../cookie";
export default function oAuthCallback(params: {
    options: InternalOptions<"oauth">;
    query: RequestInternal["query"];
    body: RequestInternal["body"];
    method: Required<RequestInternal>["method"];
    cookies: RequestInternal["cookies"];
}): Promise<{
    cookies: Cookie[];
    profile?: import("../../types").User | undefined;
    account?: {
        access_token?: string | undefined;
        token_type?: string | undefined;
        id_token?: string | undefined;
        refresh_token?: string | undefined;
        expires_in?: number | undefined;
        expires_at?: number | undefined;
        session_state?: string | undefined;
        scope?: string | undefined;
        provider: string;
        type: "oauth";
        providerAccountId: string;
    } | undefined;
    OAuthProfile?: Profile | undefined;
}>;
export interface GetProfileParams {
    profile: Profile;
    tokens: TokenSet;
    provider: OAuthConfig<any>;
    logger: LoggerInstance;
}
//# sourceMappingURL=callback.d.ts.map