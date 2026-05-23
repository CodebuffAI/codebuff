/**
 * Types extracted from https://discord.com/developers/docs/topics/oauth2
 */
import type { APITeam } from './teams';
import type { APIUser } from './user';
/**
 * https://discord.com/developers/docs/topics/oauth2#get-current-application-information-response-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIApplication {
    id: string;
    name: string;
    icon: string | null;
    description: string;
    rpc_origins?: string[];
    bot_public: boolean;
    bot_require_code_grant: boolean;
    owner: APIUser;
    summary: string;
    verify_key: string;
    team: APITeam | null;
    guild_id?: string;
    primary_sku_id?: string;
    slug?: string;
    cover_image?: string;
}
//# sourceMappingURL=oauth2.d.ts.map