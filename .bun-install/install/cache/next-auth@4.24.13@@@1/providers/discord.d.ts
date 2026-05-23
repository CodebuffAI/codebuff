import type { OAuthConfig, OAuthUserConfig } from ".";
export interface DiscordProfile extends Record<string, any> {
    accent_color: number;
    avatar: string;
    banner: string;
    banner_color: string;
    discriminator: string;
    email: string;
    flags: number;
    id: string;
    image_url: string;
    locale: string;
    mfa_enabled: boolean;
    premium_type: number;
    public_flags: number;
    username: string;
    verified: boolean;
}
export default function Discord<P extends DiscordProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
//# sourceMappingURL=discord.d.ts.map