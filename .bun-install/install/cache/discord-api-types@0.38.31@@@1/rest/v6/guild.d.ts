import type { APIBan, APIChannel, APIGuild, APIGuildIntegration, APIGuildMember, APIGuildPreview, APIGuildWidgetSettings, APIInvite, APIRole, APIVoiceRegion, GuildDefaultMessageNotifications, GuildExplicitContentFilter, GuildFeature, GuildVerificationLevel, GuildWidgetStyle, IntegrationExpireBehavior } from '../../payloads/v6/index';
import type { RESTPutAPIChannelPermissionsJSONBody } from './channel';
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIGuildCreateOverwrite extends RESTPutAPIChannelPermissionsJSONBody {
    id: number | string;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type APIGuildCreatePartialChannel = Partial<Pick<APIChannel, 'bitrate' | 'nsfw' | 'rate_limit_per_user' | 'topic' | 'type' | 'user_limit'>> & {
    name: string;
    id?: number | string | undefined;
    parent_id?: number | string | undefined;
    permission_overwrites?: APIGuildCreateOverwrite[] | undefined;
};
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIGuildCreateRole extends RESTPostAPIGuildRoleJSONBody {
    id: number | string;
}
/**
 * https://discord.com/developers/docs/resources/guild#create-guild
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPostAPIGuildsJSONBody {
    name: string;
    region?: string | undefined;
    icon?: string | undefined;
    verification_level?: GuildVerificationLevel | undefined;
    default_message_notifications?: GuildDefaultMessageNotifications | undefined;
    explicit_content_filter?: GuildExplicitContentFilter | undefined;
    roles?: APIGuildCreateRole[] | undefined;
    channels?: APIGuildCreatePartialChannel[] | undefined;
    afk_channel_id?: number | string | undefined;
    afk_timeout?: number | undefined;
    system_channel_id?: number | string | undefined;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPostAPIGuildsResult = APIGuild;
/**
 * https://discord.com/developers/docs/resources/guild#get-guild
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTGetAPIGuildQuery {
    with_counts?: boolean;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIGuildResult = APIGuild;
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-preview
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIGuildPreviewResult = APIGuildPreview;
/**
 * https://discord.com/developers/docs/resources/guild#modify-guild
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPatchAPIGuildJSONBody {
    name?: string | undefined;
    region?: string | undefined;
    verification_level?: GuildVerificationLevel | undefined;
    default_message_notifications?: GuildDefaultMessageNotifications | undefined;
    explicit_content_filter?: GuildExplicitContentFilter | undefined;
    afk_channel_id?: string | null | undefined;
    afk_timeout?: number | undefined;
    icon?: string | null | undefined;
    owner_id?: string | undefined;
    splash?: string | null | undefined;
    discovery_splash?: string | null | undefined;
    banner?: string | null | undefined;
    system_channel_id?: string | null | undefined;
    rules_channel_id?: string | null | undefined;
    public_updates_channel_id?: string | null | undefined;
    preferred_locale?: string | undefined;
    features?: GuildFeature[] | undefined;
    description?: string | null | undefined;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPatchAPIGuildResult = APIGuild;
/**
 * https://discord.com/developers/docs/resources/guild#delete-guild
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTDeleteAPIGuildResult = never;
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-channels
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIGuildChannelsResult = APIChannel[];
/**
 * https://discord.com/developers/docs/resources/guild#create-guild-channel
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPostAPIGuildChannelJSONBody = Partial<Pick<APIChannel, 'bitrate' | 'nsfw' | 'parent_id' | 'permission_overwrites' | 'rate_limit_per_user' | 'topic' | 'type' | 'user_limit'>> & Required<Pick<APIChannel, 'name'>>;
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPostAPIGuildChannelResult = APIChannel;
/**
 * https://discord.com/developers/docs/resources/guild#modify-guild-channel-positions
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPatchAPIGuildChannelPositionsJSONBody = {
    id: string;
    position: number;
    lock_permissions?: boolean | undefined;
    parent_id?: string | null | undefined;
}[];
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPatchAPIGuildChannelPositionsResult = never;
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-member
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIGuildMemberResult = APIGuildMember;
/**
 * https://discord.com/developers/docs/resources/guild#list-guild-members
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTGetAPIGuildMembersQuery {
    limit?: number;
    after?: string;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIGuildMembersResult = APIGuildMember[];
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTGetAPIGuildMembersSearchQuery {
    query: string;
    limit?: number;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIGuildMembersSearchResult = APIGuildMember[];
/**
 * https://discord.com/developers/docs/resources/guild#add-guild-member
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPutAPIGuildMemberJSONBody {
    access_token: string;
    nick?: string | undefined;
    roles?: string[] | undefined;
    mute?: boolean | undefined;
    deaf?: boolean | undefined;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPutAPIGuildMemberResult = APIGuildMember | undefined;
/**
 * https://discord.com/developers/docs/resources/guild#modify-guild-member
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPatchAPIGuildMemberJSONBody {
    nick?: string | null | undefined;
    roles?: string[] | null | undefined;
    mute?: boolean | null | undefined;
    deaf?: boolean | null | undefined;
    channel_id?: string | null | undefined;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPatchAPIGuildMemberResult = never;
/**
 * https://discord.com/developers/docs/resources/guild#modify-current-user-nick
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPatchAPICurrentGuildMemberNicknameJSONBody {
    nick?: string | null | undefined;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPatchAPICurrentGuildMemberNicknameResult = Required<RESTPatchAPICurrentGuildMemberNicknameJSONBody>;
/**
 * https://discord.com/developers/docs/resources/guild#add-guild-member-role
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPutAPIGuildMemberRoleResult = never;
/**
 * https://discord.com/developers/docs/resources/guild#remove-guild-member-role
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTDeleteAPIGuildMemberRoleResult = never;
/**
 * https://discord.com/developers/docs/resources/guild#remove-guild-member
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTDeleteAPIGuildMemberResult = never;
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-bans
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIGuildBansResult = APIBan[];
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-ban
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIGuildBanResult = APIBan;
/**
 * https://discord.com/developers/docs/resources/guild#create-guild-ban
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPutAPIGuildBanJSONBody {
    delete_message_days?: number | undefined;
    reason?: string | undefined;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPutAPIGuildBanResult = never;
/**
 * https://discord.com/developers/docs/resources/guild#remove-guild-ban
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTDeleteAPIGuildBanResult = never;
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-roles
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIGuildRolesResult = APIRole[];
/**
 * https://discord.com/developers/docs/resources/guild#create-guild-role
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPostAPIGuildRoleJSONBody {
    name?: string | null | undefined;
    permissions?: number | string | null | undefined;
    color?: number | null | undefined;
    hoist?: boolean | null | undefined;
    mentionable?: boolean | null | undefined;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPostAPIGuildRoleResult = APIRole;
/**
 * https://discord.com/developers/docs/resources/guild#modify-guild-role-positions
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPatchAPIGuildRolePositionsJSONBody = {
    id: string;
    position?: number | undefined;
}[];
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPatchAPIGuildRolePositionsResult = APIRole[];
/**
 * https://discord.com/developers/docs/resources/guild#modify-guild-role
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPatchAPIGuildRoleJSONBody {
    name?: string | undefined;
    permissions?: number | string | undefined;
    color?: number | undefined;
    hoist?: boolean | undefined;
    mentionable?: boolean | undefined;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPatchAPIGuildRoleResult = APIRole;
/**
 * https://discord.com/developers/docs/resources/guild#delete-guild-role
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTDeleteAPIGuildRoleResult = never;
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-prune-count
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTGetAPIGuildPruneCountQuery {
    days?: number;
    /**
     * While this is typed as a string, it represents an array of
     * role IDs delimited by commas.
     *
     * @see https://discord.com/developers/docs/resources/guild#get-guild-prune-count-query-string-params
     */
    include_roles?: string;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTGetAPIGuildPruneCountResult {
    pruned: number;
}
/**
 * https://discord.com/developers/docs/resources/guild#begin-guild-prune
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPostAPIGuildPruneJSONBody {
    days?: number | undefined;
    compute_prune_count?: boolean | undefined;
    include_roles?: string[] | undefined;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPostAPIGuildPruneResult {
    pruned: number | null;
}
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-voice-regions
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIGuildVoiceRegionsResult = APIVoiceRegion[];
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-invites
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIGuildInvitesResult = APIInvite[];
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-integrations
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTGetAPIGuildIntegrationsQuery {
    include_applications?: boolean;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIGuildIntegrationsResult = APIGuildIntegration[];
/**
 * https://discord.com/developers/docs/resources/guild#create-guild-integration
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPostAPIGuildIntegrationJSONBody {
    type: string;
    id: string;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPostAPIGuildIntegrationResult = never;
/**
 * https://discord.com/developers/docs/resources/guild#modify-guild-integration
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTPatchAPIGuildIntegrationJSONBody {
    expire_behavior?: IntegrationExpireBehavior | null | undefined;
    expire_grace_period?: number | null | undefined;
    enable_emoticons?: boolean | null | undefined;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPatchAPIGuildIntegrationResult = never;
/**
 * https://discord.com/developers/docs/resources/guild#delete-guild-integration
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTDeleteAPIGuildIntegrationResult = never;
/**
 * https://discord.com/developers/docs/resources/guild#sync-guild-integration
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPostAPIGuildIntegrationSyncResult = never;
/**
 * @deprecated Renamed to RESTGetAPIGuildWidgetSettingsResult
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIGuildWidgetResult = APIGuildWidgetSettings;
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-widget-settings
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIGuildWidgetSettingsResult = APIGuildWidgetSettings;
/**
 * @deprecated Renamed to RESTPatchAPIGuildWidgetSettingsJSONBody
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPatchAPIGuildWidgetJSONBody = Partial<APIGuildWidgetSettings>;
/**
 * https://discord.com/developers/docs/resources/guild#modify-guild-widget
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPatchAPIGuildWidgetSettingsJSONBody = Partial<APIGuildWidgetSettings>;
/**
 * @deprecated Use `RESTPatchAPIGuildWidgetSettingsResult` instead
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPatchAPIGuildWidgetResult = APIGuildWidgetSettings;
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTPatchAPIGuildWidgetSettingsResult = APIGuildWidgetSettings;
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-vanity-url
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTGetAPIGuildVanityUrlResult {
    code: string | null;
    uses: number;
}
/**
 * https://discord.com/developers/docs/resources/guild#get-guild-widget-image
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export interface RESTGetAPIGuildWidgetImageQuery {
    style?: GuildWidgetStyle;
}
/**
 * Note: while the return type is `ArrayBuffer`, the expected result is
 * a buffer of sorts (depends if in browser or on node.js/deno).
 *
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export type RESTGetAPIGuildWidgetImageResult = ArrayBuffer;
//# sourceMappingURL=guild.d.ts.map