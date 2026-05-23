import type { OAuthConfig, OAuthUserConfig } from ".";
export interface WorkOSProfile extends Record<string, any> {
    object: string;
    id: string;
    organization_id: string;
    connection_id: string;
    connection_type: string;
    idp_id: string;
    email: string;
    first_name: string;
    last_name: string;
    raw_attributes: {
        id: string;
        email: string;
        lastName: string;
        firstName: string;
        picture: string;
    };
}
export default function WorkOS<P extends WorkOSProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
//# sourceMappingURL=workos.d.ts.map