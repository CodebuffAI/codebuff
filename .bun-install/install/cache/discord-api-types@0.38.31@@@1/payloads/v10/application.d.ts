/**
 * Types extracted from https://discord.com/developers/docs/resources/application
 */
import type { Permissions, Snowflake } from '../../globals';
import type { LocalizationMap } from '../common';
import type { APIPartialGuild } from './guild';
import type { ApplicationIntegrationType } from './interactions';
import type { OAuth2Scopes } from './oauth2';
import type { APITeam } from './teams';
import type { APIUser } from './user';
import type { ApplicationWebhookEventType } from './webhook';
/**
 * @see {@link https://discord.com/developers/docs/resources/application#application-object}
 */
export interface APIApplication {
    /**
     * The id of the app
     */
    id: Snowflake;
    /**
     * The name of the app
     */
    name: string;
    /**
     * The icon hash of the app
     */
    icon: string | null;
    /**
     * The description of the app
     */
    description: string;
    /**
     * An array of rpc origin urls, if rpc is enabled
     */
    rpc_origins?: string[];
    /**
     * When `false` only app owner can join the app's bot to guilds
     */
    bot_public: boolean;
    /**
     * When `true` the app's bot will only join upon completion of the full oauth2 code grant flow
     */
    bot_require_code_grant: boolean;
    /**
     * Partial user object for the bot user associated with the application
     */
    bot?: APIUser;
    /**
     * The url of the application's terms of service
     */
    terms_of_service_url?: string;
    /**
     * The url of the application's privacy policy
     */
    privacy_policy_url?: string;
    /**
     * Partial user object containing info on the owner of the application
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object}
     */
    owner?: APIUser;
    /**
     * An empty string
     *
     * @deprecated This field will be removed in v11
     * @unstable This field is no longer documented by Discord and will be removed in v11
     */
    summary: '';
    /**
     * The hexadecimal encoded key for verification in interactions and the GameSDK's GetTicket function
     *
     * @see {@link https://discord.com/developers/docs/game-sdk/applications#getticket}
     */
    verify_key: string;
    /**
     * The team this application belongs to
     *
     * @see {@link https://discord.com/developers/docs/topics/teams#data-models-team-object}
     */
    team: APITeam | null;
    /**
     * If this application is a game sold on Discord, this field will be the guild to which it has been linked
     */
    guild_id?: Snowflake;
    /**
     * A partial object of the associated guild
     */
    guild?: APIPartialGuild;
    /**
     * If this application is a game sold on Discord, this field will be the id of the "Game SKU" that is created, if exists
     */
    primary_sku_id?: Snowflake;
    /**
     * If this application is a game sold on Discord, this field will be the URL slug that links to the store page
     */
    slug?: string;
    /**
     * If this application is a game sold on Discord, this field will be the hash of the image on store embeds
     */
    cover_image?: string;
    /**
     * The application's public flags
     *
     * @see {@link https://discord.com/developers/docs/resources/application#application-object-application-flags}
     */
    flags: ApplicationFlags;
    /**
     * Approximate count of guilds the application has been added to
     */
    approximate_guild_count?: number;
    /**
     * Approximate count of users that have installed the app (authorized with `application.commands` as a scope)
     */
    approximate_user_install_count?: number;
    /**
     * Approximate count of users that have OAuth2 authorizations for the app
     */
    approximate_user_authorization_count?: number;
    /**
     * Array of redirect URIs for the application
     */
    redirect_uris?: string[];
    /**
     * The interactions endpoint URL for the application
     */
    interactions_endpoint_url?: string | null;
    /**
     * The application's role connection verification entry point,
     * which when configured will render the app as a verification method in the guild role verification configuration
     */
    role_connections_verification_url?: string | null;
    /**
     * Up to 5 tags of max 20 characters each describing the content and functionality of the application
     */
    tags?: [string, string?, string?, string?, string?];
    /**
     * Settings for the application's default in-app authorization link, if enabled
     */
    install_params?: APIApplicationInstallParams;
    /**
     * Default scopes and permissions for each supported installation context. Value for each key is an integration type configuration object
     */
    integration_types_config?: APIApplicationIntegrationTypesConfigMap;
    /**
     * The application's default custom authorization link, if enabled
     */
    custom_install_url?: string;
    /**
     * Event webhook URL for the app to receive webhook events
     */
    event_webhooks_url?: string | null;
    /**
     * If webhook events are enabled for the app
     */
    event_webhooks_status: ApplicationWebhookEventStatus;
    /**
     * List of webhook event types the app subscribes to
     */
    event_webhooks_types?: ApplicationWebhookEventType[];
}
export interface APIApplicationInstallParams {
    scopes: OAuth2Scopes[];
    permissions: Permissions;
}
export interface APIApplicationIntegrationTypeConfiguration {
    oauth2_install_params?: APIApplicationInstallParams;
}
export type APIApplicationIntegrationTypesConfigMap = {
    [key in ApplicationIntegrationType]?: APIApplicationIntegrationTypeConfiguration;
};
/**
 * @see {@link https://discord.com/developers/docs/resources/application#application-object-application-flags}
 */
export declare enum ApplicationFlags {
    /**
     * @unstable This application flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    EmbeddedReleased = 2,
    /**
     * @unstable This application flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    ManagedEmoji = 4,
    /**
     * @unstable This application flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    EmbeddedIAP = 8,
    /**
     * @unstable This application flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    GroupDMCreate = 16,
    /**
     * Indicates if an app uses the Auto Moderation API
     */
    ApplicationAutoModerationRuleCreateBadge = 64,
    /**
     * @unstable This application flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    RPCHasConnected = 2048,
    /**
     * Intent required for bots in 100 or more servers to receive `presence_update` events
     */
    GatewayPresence = 4096,
    /**
     * Intent required for bots in under 100 servers to receive `presence_update` events, found in Bot Settings
     */
    GatewayPresenceLimited = 8192,
    /**
     * Intent required for bots in 100 or more servers to receive member-related events like `guild_member_add`.
     *
     * @see List of member-related events {@link https://discord.com/developers/docs/topics/gateway#list-of-intents | under `GUILD_MEMBERS`}
     */
    GatewayGuildMembers = 16384,
    /**
     * Intent required for bots in under 100 servers to receive member-related events like `guild_member_add`, found in Bot Settings.
     *
     * @see List of member-related events {@link https://discord.com/developers/docs/topics/gateway#list-of-intents | under `GUILD_MEMBERS`}
     */
    GatewayGuildMembersLimited = 32768,
    /**
     * Indicates unusual growth of an app that prevents verification
     */
    VerificationPendingGuildLimit = 65536,
    /**
     * Indicates if an app is embedded within the Discord client (currently unavailable publicly)
     */
    Embedded = 131072,
    /**
     * Intent required for bots in 100 or more servers to receive {@link https://support-dev.discord.com/hc/articles/6207308062871 | message content}
     */
    GatewayMessageContent = 262144,
    /**
     * Intent required for bots in under 100 servers to receive {@link https://support-dev.discord.com/hc/articles/6207308062871 | message content},
     * found in Bot Settings
     */
    GatewayMessageContentLimited = 524288,
    /**
     * @unstable This application flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    EmbeddedFirstParty = 1048576,
    /**
     * Indicates if an app has registered global {@link https://discord.com/developers/docs/interactions/application-commands | application commands}
     */
    ApplicationCommandBadge = 8388608
}
/**
 * @see {@link https://discord.com/developers/docs/resources/application-role-connection-metadata#application-role-connection-metadata-object-application-role-connection-metadata-structure}
 */
export interface APIApplicationRoleConnectionMetadata {
    /**
     * Type of metadata value
     */
    type: ApplicationRoleConnectionMetadataType;
    /**
     * Dictionary key for the metadata field (must be `a-z`, `0-9`, or `_` characters; 1-50 characters)
     */
    key: string;
    /**
     * Name of the metadata field (1-100 characters)
     */
    name: string;
    /**
     * Translations of the name
     */
    name_localizations?: LocalizationMap;
    /**
     * Description of the metadata field (1-200 characters)
     */
    description: string;
    /**
     * Translations of the description
     */
    description_localizations?: LocalizationMap;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/application-role-connection-metadata#application-role-connection-metadata-object-application-role-connection-metadata-type}
 */
export declare enum ApplicationRoleConnectionMetadataType {
    /**
     * The metadata value (`integer`) is less than or equal to the guild's configured value (`integer`)
     */
    IntegerLessThanOrEqual = 1,
    /**
     * The metadata value (`integer`) is greater than or equal to the guild's configured value (`integer`)
     */
    IntegerGreaterThanOrEqual = 2,
    /**
     * The metadata value (`integer`) is equal to the guild's configured value (`integer`)
     */
    IntegerEqual = 3,
    /**
     * The metadata value (`integer`) is not equal to the guild's configured value (`integer`)
     */
    IntegerNotEqual = 4,
    /**
     * The metadata value (`ISO8601 string`) is less than or equal to the guild's configured value (`integer`; days before current date)
     */
    DatetimeLessThanOrEqual = 5,
    /**
     * The metadata value (`ISO8601 string`) is greater than or equal to the guild's configured value (`integer`; days before current date)
     */
    DatetimeGreaterThanOrEqual = 6,
    /**
     * The metadata value (`integer`) is equal to the guild's configured value (`integer`; `1`)
     */
    BooleanEqual = 7,
    /**
     * The metadata value (`integer`) is not equal to the guild's configured value (`integer`; `1`)
     */
    BooleanNotEqual = 8
}
/**
 * @see {@link https://discord.com/developers/docs/resources/application#application-object-application-event-webhook-status}
 */
export declare enum ApplicationWebhookEventStatus {
    /**
     * Webhook events are disabled by developer
     */
    Disabled = 1,
    /**
     * Webhook events are enabled by developer
     */
    Enabled = 2,
    /**
     * Webhook events are disabled by Discord, usually due to inactivity
     */
    DisabledByDiscord = 3
}
//# sourceMappingURL=application.d.ts.map