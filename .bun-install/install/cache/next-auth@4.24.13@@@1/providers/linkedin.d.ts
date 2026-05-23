import type { OAuthConfig, OAuthUserConfig } from ".";
interface Identifier {
    identifier: string;
}
interface Element {
    identifiers?: Identifier[];
}
export interface LinkedInProfile extends Record<string, any> {
    id: string;
    localizedFirstName: string;
    localizedLastName: string;
    profilePicture: {
        "displayImage~": {
            elements?: Element[];
        };
    };
}
export default function LinkedIn<P extends LinkedInProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
export {};
//# sourceMappingURL=linkedin.d.ts.map