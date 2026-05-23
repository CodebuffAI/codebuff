import type { OAuthConfig, OAuthUserConfig } from ".";
/** @see [Supported Scopes](https://docs.passage.id/hosted-login/oidc-client-configuration#supported-scopes) */
export interface PassageProfile {
    iss: string;
    /** Unique identifer in Passage for the user */
    sub: string;
    aud: string[];
    exp: number;
    iat: number;
    auth_time: number;
    azp: string;
    client_id: string;
    at_hash: string;
    c_hash: string;
    /** The user's email address */
    email: string;
    /** Whether the user has verified their email address */
    email_verified: boolean;
    /** The user's phone number */
    phone: string;
    /** Whether the user has verified their phone number */
    phone_number_verified: boolean;
}
export default function Passage(config: OAuthUserConfig<PassageProfile>): OAuthConfig<PassageProfile>;
//# sourceMappingURL=passage.d.ts.map