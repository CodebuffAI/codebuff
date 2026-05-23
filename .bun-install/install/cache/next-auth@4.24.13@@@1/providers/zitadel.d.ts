import type { OAuthConfig, OAuthUserConfig } from ".";
export interface ZitadelProfile extends Record<string, any> {
    amr: string;
    aud: string;
    auth_time: number;
    azp: string;
    email: string;
    email_verified: boolean;
    exp: number;
    family_name: string;
    given_name: string;
    gender: string;
    iat: number;
    iss: string;
    jti: string;
    locale: string;
    name: string;
    nbf: number;
    picture: string;
    phone: string;
    phone_verified: boolean;
    preferred_username: string;
    sub: string;
}
export default function Zitadel<P extends ZitadelProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
//# sourceMappingURL=zitadel.d.ts.map