import type { OAuthConfig, OAuthUserConfig } from ".";
export interface BattleNetProfile extends Record<string, any> {
    sub: string;
    battle_tag: string;
}
/** See the [available regions](https://develop.battle.net/documentation/guides/regionality-and-apis) */
export declare type BattleNetIssuer = "https://www.battlenet.com.cn/oauth" | `https://${"us" | "eu" | "kr" | "tw"}.battle.net/oauth`;
export default function BattleNet<P extends BattleNetProfile>(options: OAuthUserConfig<P> & {
    issuer: BattleNetIssuer;
}): OAuthConfig<P>;
//# sourceMappingURL=battlenet.d.ts.map