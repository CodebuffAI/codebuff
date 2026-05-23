import type { OAuthConfig, OAuthUserConfig } from ".";
export interface TwitchProfile extends Record<string, any> {
    sub: string;
    preferred_username: string;
    email: string;
    picture: string;
}
export default function Twitch<P extends TwitchProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
//# sourceMappingURL=twitch.d.ts.map