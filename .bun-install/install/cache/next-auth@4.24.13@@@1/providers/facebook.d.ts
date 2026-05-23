import type { OAuthConfig, OAuthUserConfig } from ".";
interface FacebookPictureData {
    url: string;
}
interface FacebookPicture {
    data: FacebookPictureData;
}
export interface FacebookProfile extends Record<string, any> {
    id: string;
    picture: FacebookPicture;
}
export default function Facebook<P extends FacebookProfile>(options: OAuthUserConfig<P>): OAuthConfig<P>;
export {};
//# sourceMappingURL=facebook.d.ts.map