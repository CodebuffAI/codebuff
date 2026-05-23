import type { OAuthConfig, OAuthUserConfig } from ".";
export interface EVEOnlineProfile extends Record<string, any> {
    CharacterID: number;
    CharacterName: string;
    ExpiresOn: string;
    Scopes: string;
    TokenType: string;
    CharacterOwnerHash: string;
    IntellectualProperty: string;
}
export default function EVEOnline<P extends EVEOnlineProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
//# sourceMappingURL=eveonline.d.ts.map