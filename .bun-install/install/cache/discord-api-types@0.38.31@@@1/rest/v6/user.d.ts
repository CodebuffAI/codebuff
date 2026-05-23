import type { APIChannel, APIConnection, APIUser, GuildFeature } from '../../payloads/v6/index';
/**
 * https://discord.com/developers/docs/resources/user#get-current-user
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPICurrentUserResult = APIUser;
/**
 * https://discord.com/developers/docs/resources/user#get-user
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIUserResult = APIUser;
/**
 * https://discord.com/developers/docs/resources/user#modify-current-user
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPatchAPICurrentUserJSONBody {
    username?: string | undefined;
    avatar?: string | null | undefined;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPatchAPICurrentUserResult = APIUser;
/**
 * https://discord.com/developers/docs/resources/user#get-current-user-guilds
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTGetAPICurrentUserGuildsQuery {
    before?: string;
    after?: string;
    limit?: number;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTAPIPartialCurrentUserGuild {
    id: string;
    name: string;
    icon: string | null;
    owner: boolean;
    features: GuildFeature[];
    /**
     * @deprecated Use `permissions_new` instead
     */
    permissions: number;
    permissions_new: string;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPICurrentUserGuildsResult = RESTAPIPartialCurrentUserGuild[];
/**
 * https://discord.com/developers/docs/resources/user#leave-guild
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTDeleteAPICurrentUserGuildResult = never;
/**
 * https://discord.com/developers/docs/resources/user#create-dm
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPostAPICurrentUserCreateDMChannelJSONBody {
    recipient_id: string;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPostAPICurrentUserCreateDMChannelResult = APIChannel;
/**
 * https://discord.com/developers/docs/resources/user#get-user-connections
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPICurrentUserConnectionsResult = APIConnection[];
//# sourceMappingURL=user.d.ts.map