import type { Permissions, Snowflake } from '../../globals';
import type { APIChannel, APIConnection, APIGuildMember, APIUser, APIApplicationRoleConnection, GuildFeature } from '../../payloads/v9/index';
/**
 * @see {@link https://discord.com/developers/docs/resources/user#get-current-user}
 */
export type RESTGetAPICurrentUserResult = APIUser;
/**
 * @see {@link https://discord.com/developers/docs/resources/user#get-user}
 */
export type RESTGetAPIUserResult = APIUser;
/**
 * @see {@link https://discord.com/developers/docs/resources/user#get-current-user-guild-member}
 */
export type RESTGetCurrentUserGuildMemberResult = APIGuildMember;
/**
 * @see {@link https://discord.com/developers/docs/resources/user#modify-current-user}
 */
export interface RESTPatchAPICurrentUserJSONBody {
    /**
     * User's username, if changed may cause the user's discriminator to be randomized
     */
    username?: string | undefined;
    /**
     * If passed, modifies the user's avatar
     */
    avatar?: string | null | undefined;
    /**
     * If passed, modifies the user's banner
     */
    banner?: string | null | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/user#modify-current-user}
 */
export type RESTPatchAPICurrentUserResult = APIUser;
/**
 * @see {@link https://discord.com/developers/docs/resources/user#get-current-user-guilds}
 */
export interface RESTGetAPICurrentUserGuildsQuery {
    /**
     * Get guilds before this guild ID
     */
    before?: Snowflake;
    /**
     * Get guilds after this guild ID
     */
    after?: Snowflake;
    /**
     * Max number of guilds to return (1-200)
     *
     * @defaultValue `200`
     */
    limit?: number;
    /**
     * Include approximate member and presence counts in response
     *
     * @defaultValue `false`
     */
    with_counts?: boolean;
}
export interface RESTAPIPartialCurrentUserGuild {
    id: Snowflake;
    name: string;
    icon: string | null;
    banner: string | null;
    owner: boolean;
    features: GuildFeature[];
    permissions: Permissions;
    approximate_member_count?: number;
    approximate_presence_count?: number;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/user#get-current-user-guilds}
 */
export type RESTGetAPICurrentUserGuildsResult = RESTAPIPartialCurrentUserGuild[];
/**
 * @see {@link https://discord.com/developers/docs/resources/user#leave-guild}
 */
export type RESTDeleteAPICurrentUserGuildResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/user#create-dm}
 */
export interface RESTPostAPICurrentUserCreateDMChannelJSONBody {
    /**
     * The recipient to open a DM channel with
     */
    recipient_id: string;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/user#create-dm}
 */
export type RESTPostAPICurrentUserCreateDMChannelResult = APIChannel;
/**
 * @see {@link https://discord.com/developers/docs/resources/user#get-user-connections}
 */
export type RESTGetAPICurrentUserConnectionsResult = APIConnection[];
/**
 * @see {@link https://discord.com/developers/docs/resources/user#get-user-application-role-connection}
 */
export type RESTGetAPICurrentUserApplicationRoleConnectionResult = APIApplicationRoleConnection;
/**
 * @see {@link https://discord.com/developers/docs/resources/user#update-user-application-role-connection}
 */
export interface RESTPutAPICurrentUserApplicationRoleConnectionJSONBody {
    /**
     * The vanity name of the platform a bot has connected (max 50 characters)
     */
    platform_name?: string | undefined;
    /**
     * The username on the platform a bot has connected (max 100 characters)
     */
    platform_username?: string | undefined;
    /**
     * Object mapping application role connection metadata keys to their `string`-ified value (max 100 characters) for the user on the platform a bot has connected
     */
    metadata?: Record<string, number | string> | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/user#update-user-application-role-connection}
 */
export type RESTPutAPICurrentUserApplicationRoleConnectionResult = APIApplicationRoleConnection;
//# sourceMappingURL=user.d.ts.map