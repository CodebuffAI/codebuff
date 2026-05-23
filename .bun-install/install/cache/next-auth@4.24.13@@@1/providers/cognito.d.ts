import type { OAuthConfig, OAuthUserConfig } from ".";
export interface CognitoProfile extends Record<string, any> {
    sub: string;
    name: string;
    email: string;
    picture: string;
}
export default function Cognito<P extends CognitoProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
//# sourceMappingURL=cognito.d.ts.map