import { OAuthConfig, OAuthUserConfig } from "./oauth";
/** This is the default openid signature returned from FusionAuth
 * it can be customized using [lambda functions](https://fusionauth.io/docs/v1/tech/lambdas)
 */
export interface FusionAuthProfile extends Record<string, any> {
    aud: string;
    exp: number;
    iat: number;
    iss: string;
    sub: string;
    jti: string;
    authenticationType: string;
    email: string;
    email_verified: boolean;
    preferred_username: string;
    at_hash: string;
    c_hash: string;
    scope: string;
    sid: string;
}
export default function FusionAuth<P extends FusionAuthProfile>(options: OAuthUserConfig<P> & {
    tenantId?: string;
}): OAuthConfig<P>;
//# sourceMappingURL=fusionauth.d.ts.map