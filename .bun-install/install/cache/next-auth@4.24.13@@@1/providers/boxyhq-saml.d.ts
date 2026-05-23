import type { OAuthConfig, OAuthUserConfig } from ".";
export interface BoxyHQSAMLProfile extends Record<string, any> {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
}
export default function SAMLJackson<P extends BoxyHQSAMLProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
//# sourceMappingURL=boxyhq-saml.d.ts.map