import type { OAuthConfig, OAuthUserConfig } from ".";
export interface AzureB2CProfile extends Record<string, any> {
    exp: number;
    nbf: number;
    ver: string;
    iss: string;
    sub: string;
    aud: string;
    iat: number;
    auth_time: number;
    oid: string;
    country: string;
    name: string;
    postalCode: string;
    emails: string[];
    tfp: string;
}
export default function AzureADB2C<P extends AzureB2CProfile>(options: OAuthUserConfig<P> & {
    primaryUserFlow?: string;
    tenantId?: string;
}): OAuthConfig<P>;
//# sourceMappingURL=azure-ad-b2c.d.ts.map