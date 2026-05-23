import type { OAuthConfig, OAuthUserConfig } from "./oauth";
export interface DuendeISUser extends Record<string, any> {
    email: string;
    id: string;
    name: string;
    verified: boolean;
}
export default function DuendeIdentityServer6<P extends DuendeISUser>(options: OAuthUserConfig<P>): OAuthConfig<P>;
//# sourceMappingURL=duende-identity-server6.d.ts.map