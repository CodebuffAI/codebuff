import type { OAuthConfig, OAuthUserConfig } from ".";
export interface UnitedEffectsProfile extends Record<string, any> {
    sub: string;
    email: string;
}
export default function UnitedEffects<P extends UnitedEffectsProfile>(options: OAuthUserConfig<P> & {
    issuer: string;
}): OAuthConfig<P>;
//# sourceMappingURL=united-effects.d.ts.map