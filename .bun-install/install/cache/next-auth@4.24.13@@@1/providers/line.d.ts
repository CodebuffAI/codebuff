import type { OAuthConfig, OAuthUserConfig } from ".";
export interface LineProfile extends Record<string, any> {
    iss: string;
    sub: string;
    aud: string;
    exp: number;
    iat: number;
    amr: string[];
    name: string;
    picture: string;
    user: any;
}
export default function LINE<P extends LineProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
//# sourceMappingURL=line.d.ts.map