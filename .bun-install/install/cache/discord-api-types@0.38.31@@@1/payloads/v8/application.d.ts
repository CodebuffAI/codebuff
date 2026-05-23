/**
 * Types extracted from https://discord.com/developers/docs/resources/application
 */
import type { Permissions, Snowflake } from '../../globals';
import type { OAuth2Scopes } from './oauth2';
import type { APITeam } from './teams';
import type { APIUser } from './user';
/**
 * https://discord.com/developers/docs/resources/application#application-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
     * See https://discord.com/developers/docs/resources/user#user-object
     */
    owner?: APIUser;
    /**
     * If this application is a game sold on Discord, this field will be the summary field for the store page
     * of its primary sku
     *
     * @deprecated Always an empty string, will be removed in v11
     */
    summary: '';
    /**
     * The hexadecimal encoded key for verification in interactions and the GameSDK's GetTicket function
     *
     * See https://discord.com/developers/docs/game-sdk/applications#get-ticket
     */
    verify_key: string;
    /**
     * The team this application belongs to
     *
     * See https://discord.com/developers/docs/topics/teams#data-models-team-object
     */
    team: APITeam | null;
    /**
     * If this application is a game sold on Discord, this field will be the guild to which it has been linked
     */
    guild_id?: Snowflake;
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
     * See https://discord.com/developers/docs/resources/application#application-object-application-flags
     */
    flags: ApplicationFlags;
    /**
     * Up to 5 tags describing the content and functionality of the application
     */
    tags?: [string, string?, string?, string?, string?];
    /**
     * Settings for the application's default in-app authorization link, if enabled
     */
    install_params?: APIApplicationInstallParams;
    /**
     * The application's default custom authorization link, if enabled
     */
    custom_install_url?: string;
}
export interface APIApplicationInstallParams {
    scopes: OAuth2Scopes[];
    permissions: Permissions;
}
/**
 * https://discord.com/developers/docs/resources/application#application-object-application-flags
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum ApplicationFlags {
    EmbeddedReleased = 2,
    ManagedEmoji = 4,
    GroupDMCreate = 16,
    RPCHasConnected = 2048,
    GatewayPresence = 4096,
    GatewayPresenceLimited = 8192,
    GatewayGuildMembers = 16384,
    GatewayGuildMembersLimited = 32768,
    VerificationPendingGuildLimit = 65536,
    Embedded = 131072,
    GatewayMessageContent = 262144,
    GatewayMessageContentLimited = 524288,
    EmbeddedFirstParty = 1048576
}
//# sourceMappingURL=application.d.ts.map