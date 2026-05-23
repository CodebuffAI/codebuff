import type { OAuthConfig, OAuthUserConfig } from ".";
export interface AzureADProfile extends Record<string, any> {
    sub: string;
    nickname: string;
    email: string;
    picture: string;
}
export default function AzureAD<P extends AzureADProfile>(options: OAuthUserConfig<P> & {
    /**
     * https://docs.microsoft.com/en-us/graph/api/profilephoto-get?view=graph-rest-1.0#examples
     * @default 48
     */
    profilePhotoSize?: 48 | 64 | 96 | 120 | 240 | 360 | 432 | 504 | 648;
    /** @default "common" */
    tenantId?: string;
}): OAuthConfig<P>;
//# sourceMappingURL=azure-ad.d.ts.map