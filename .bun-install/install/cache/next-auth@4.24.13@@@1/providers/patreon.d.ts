import type { OAuthConfig, OAuthUserConfig } from ".";
export interface PatreonProfile extends Record<string, any> {
    sub: string;
    nickname: string;
    email: string;
    picture: string;
}
export default function Patreon<P extends PatreonProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
//# sourceMappingURL=patreon.d.ts.map