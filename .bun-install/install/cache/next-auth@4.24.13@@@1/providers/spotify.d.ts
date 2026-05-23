import type { OAuthConfig, OAuthUserConfig } from ".";
export interface SpotifyImage {
    url: string;
}
export interface SpotifyProfile extends Record<string, any> {
    id: string;
    display_name: string;
    email: string;
    images: SpotifyImage[];
}
export default function Spotify<P extends SpotifyProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
//# sourceMappingURL=spotify.d.ts.map