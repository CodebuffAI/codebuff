import type { OAuthConfig, OAuthUserConfig } from ".";
interface HubSpotProfile extends Record<string, any> {
    user: string;
    user_id: string;
    hub_domain: string;
    hub_id: string;
}
export default function HubSpot<P extends HubSpotProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
export {};
//# sourceMappingURL=hubspot.d.ts.map