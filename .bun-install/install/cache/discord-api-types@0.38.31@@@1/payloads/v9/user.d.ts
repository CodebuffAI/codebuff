/**
 * Types extracted from https://discord.com/developers/docs/resources/user
 */
import type { Snowflake } from '../../globals';
import type { APIGuildIntegration } from './guild';
/**
 * @see {@link https://discord.com/developers/docs/resources/user#user-object}
 */
export interface APIUser {
    /**
     * The user's id
     */
    id: Snowflake;
    /**
     * The user's username, not unique across the platform
     */
    username: string;
    /**
     * The user's Discord-tag
     */
    discriminator: string;
    /**
     * The user's display name, if it is set. For bots, this is the application name
     */
    global_name: string | null;
    /**
     * The user's avatar hash
     *
     * @see {@link https://discord.com/developers/docs/reference#image-formatting}
     */
    avatar: string | null;
    /**
     * Whether the user belongs to an OAuth2 application
     */
    bot?: boolean;
    /**
     * Whether the user is an Official Discord System user (part of the urgent message system)
     */
    system?: boolean;
    /**
     * Whether the user has two factor enabled on their account
     */
    mfa_enabled?: boolean;
    /**
     * The user's banner hash
     *
     * @see {@link https://discord.com/developers/docs/reference#image-formatting}
     */
    banner?: string | null;
    /**
     * The user's banner color encoded as an integer representation of hexadecimal color code
     */
    accent_color?: number | null;
    /**
     * The user's chosen language option
     */
    locale?: string;
    /**
     * Whether the email on this account has been verified
     */
    verified?: boolean;
    /**
     * The user's email
     */
    email?: string | null;
    /**
     * The flags on a user's account
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object-user-flags}
     */
    flags?: UserFlags;
    /**
     * The type of Nitro subscription on a user's account
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object-premium-types}
     */
    premium_type?: UserPremiumType;
    /**
     * The public flags on a user's account
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object-user-flags}
     */
    public_flags?: UserFlags;
    /**
     * The user's avatar decoration hash
     *
     * @see {@link https://discord.com/developers/docs/reference#image-formatting}
     * @deprecated Use {@link APIUser.avatar_decoration_data} instead
     */
    avatar_decoration?: string | null;
    /**
     * The data for the user's avatar decoration
     *
     * @see {@link https://discord.com/developers/docs/resources/user#avatar-decoration-data-object}
     */
    avatar_decoration_data?: APIAvatarDecorationData | null;
    /**
     * The data for the user's collectibles
     *
     * @see {@link https://discord.com/developers/docs/resources/user#collectibles}
     */
    collectibles?: APICollectibles | null;
    /**
     * The user's primary guild
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object-user-primary-guild}
     */
    primary_guild?: APIUserPrimaryGuild | null;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/user#user-object-user-flags}
 */
export declare enum UserFlags {
    /**
     * Discord Employee
     */
    Staff = 1,
    /**
     * Partnered Server Owner
     */
    Partner = 2,
    /**
     * HypeSquad Events Member
     */
    Hypesquad = 4,
    /**
     * Bug Hunter Level 1
     */
    BugHunterLevel1 = 8,
    /**
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    MFASMS = 16,
    /**
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    PremiumPromoDismissed = 32,
    /**
     * House Bravery Member
     */
    HypeSquadOnlineHouse1 = 64,
    /**
     * House Brilliance Member
     */
    HypeSquadOnlineHouse2 = 128,
    /**
     * House Balance Member
     */
    HypeSquadOnlineHouse3 = 256,
    /**
     * Early Nitro Supporter
     */
    PremiumEarlySupporter = 512,
    /**
     * User is a {@link https://discord.com/developers/docs/topics/teams | team}
     */
    TeamPseudoUser = 1024,
    /**
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    HasUnreadUrgentMessages = 8192,
    /**
     * Bug Hunter Level 2
     */
    BugHunterLevel2 = 16384,
    /**
     * Verified Bot
     */
    VerifiedBot = 65536,
    /**
     * Early Verified Bot Developer
     */
    VerifiedDeveloper = 131072,
    /**
     * Moderator Programs Alumni
     */
    CertifiedModerator = 262144,
    /**
     * Bot uses only {@link https://discord.com/developers/docs/interactions/receiving-and-responding#receiving-an-interaction | HTTP interactions} and is shown in the online member list
     */
    BotHTTPInteractions = 524288,
    /**
     * User has been identified as spammer
     *
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    Spammer = 1048576,
    /**
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    DisablePremium = 2097152,
    /**
     * User is an {@link https://support-dev.discord.com/hc/articles/10113997751447 | Active Developer}
     */
    ActiveDeveloper = 4194304,
    /**
     * User's account has been {@link https://support.discord.com/hc/articles/6461420677527 | quarantined} based on recent activity
     *
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     * @privateRemarks
     *
     * This value would be `1 << 44`, but bit shifting above `1 << 30` requires bigints
     */
    Quarantined = 17592186044416,
    /**
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     * @privateRemarks
     *
     * This value would be `1 << 50`, but bit shifting above `1 << 30` requires bigints
     */
    Collaborator = 1125899906842624,
    /**
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     * @privateRemarks
     *
     * This value would be `1 << 51`, but bit shifting above `1 << 30` requires bigints
     */
    RestrictedCollaborator = 2251799813685248
}
/**
 * @see {@link https://discord.com/developers/docs/resources/user#user-object-premium-types}
 */
export declare enum UserPremiumType {
    None = 0,
    NitroClassic = 1,
    Nitro = 2,
    NitroBasic = 3
}
/**
 * @see {@link https://discord.com/developers/docs/resources/user#connection-object}
 */
export interface APIConnection {
    /**
     * ID of the connection account
     */
    id: string;
    /**
     * The username of the connection account
     */
    name: string;
    /**
     * The service of the connection
     *
     * @see {@link https://discord.com/developers/docs/resources/user#connection-object-services}
     */
    type: ConnectionService;
    /**
     * Whether the connection is revoked
     */
    revoked?: boolean;
    /**
     * An array of partial server integrations
     *
     * @see {@link https://discord.com/developers/docs/resources/guild#integration-object}
     */
    integrations?: Partial<APIGuildIntegration>[];
    /**
     * Whether the connection is verified
     */
    verified: boolean;
    /**
     * Whether friend sync is enabled for this connection
     */
    friend_sync: boolean;
    /**
     * Whether activities related to this connection will be shown in presence updates
     */
    show_activity: boolean;
    /**
     * Whether this connection supports console voice transfer
     */
    two_way_link: boolean;
    /**
     * Visibility of this connection
     *
     * @see {@link https://discord.com/developers/docs/resources/user#connection-object-visibility-types}
     */
    visibility: ConnectionVisibility;
}
export declare enum ConnectionService {
    AmazonMusic = "amazon-music",
    BattleNet = "battlenet",
    Bluesky = "bluesky",
    BungieNet = "bungie",
    Crunchyroll = "crunchyroll",
    Domain = "domain",
    eBay = "ebay",
    EpicGames = "epicgames",
    Facebook = "facebook",
    GitHub = "github",
    Instagram = "instagram",
    LeagueOfLegends = "leagueoflegends",
    Mastodon = "mastodon",
    PayPal = "paypal",
    PlayStationNetwork = "playstation",
    Reddit = "reddit",
    RiotGames = "riotgames",
    Roblox = "roblox",
    Spotify = "spotify",
    Skype = "skype",
    Steam = "steam",
    TikTok = "tiktok",
    Twitch = "twitch",
    X = "twitter",
    /**
     * @deprecated This is the old name for {@link ConnectionService.X}
     */
    Twitter = "twitter",
    Xbox = "xbox",
    YouTube = "youtube"
}
export declare enum ConnectionVisibility {
    /**
     * Invisible to everyone except the user themselves
     */
    None = 0,
    /**
     * Visible to everyone
     */
    Everyone = 1
}
/**
 * @see {@link https://discord.com/developers/docs/resources/user#application-role-connection-object-application-role-connection-structure}
 */
export interface APIApplicationRoleConnection {
    /**
     * The vanity name of the platform a bot has connected (max 50 characters)
     */
    platform_name: string | null;
    /**
     * The username on the platform a bot has connected (max 100 characters)
     */
    platform_username: string | null;
    /**
     * Object mapping application role connection metadata keys to their `string`-ified value (max 100 characters) for the user on the platform a bot has connected
     */
    metadata: Record<string, number | string>;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/user#avatar-decoration-data-object}
 */
export interface APIAvatarDecorationData {
    /**
     * The avatar decoration hash
     *
     * @see {@link https://discord.com/developers/docs/reference#image-formatting}
     */
    asset: string;
    /**
     * The id of the avatar decoration's SKU
     */
    sku_id: Snowflake;
}
/**
 * The collectibles the user has, excluding Avatar Decorations and Profile Effects.
 *
 * @see {@link https://discord.com/developers/docs/resources/user#collectibles}
 */
export interface APICollectibles {
    /**
     * Object mapping of {@link APINameplateData}
     */
    nameplate?: APINameplateData;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/user#nameplate}
 */
export interface APINameplateData {
    /**
     * ID of the nameplate SKU
     */
    sku_id: Snowflake;
    /**
     * Path to the nameplate asset
     *
     * @example `nameplates/nameplates/twilight/`
     */
    asset: string;
    /**
     * The label of this nameplate. Currently unused
     */
    label: string;
    /**
     * Background color of the nameplate
     */
    palette: NameplatePalette;
}
/**
 * Background color of a nameplate.
 */
export declare enum NameplatePalette {
    Berry = "berry",
    BubbleGum = "bubble_gum",
    Clover = "clover",
    Cobalt = "cobalt",
    Crimson = "crimson",
    Forest = "forest",
    Lemon = "lemon",
    Sky = "sky",
    Teal = "teal",
    Violet = "violet",
    White = "white"
}
/**
 * @see {@link https://discord.com/developers/docs/resources/user#user-object-user-primary-guild}
 */
export interface APIUserPrimaryGuild {
    /**
     * The id of the user's primary guild
     */
    identity_guild_id: Snowflake | null;
    /**
     * Whether the user is displaying the primary guild's server tag.
     * This can be `null` if the system clears the identity, e.g. because the server no longer supports tags
     */
    identity_enabled: boolean | null;
    /**
     * The text of the user's server tag. Limited to 4 characters
     */
    tag: string | null;
    /**
     * The server tag badge hash
     *
     * @see {@link https://discord.com/developers/docs/reference#image-formatting}
     */
    badge: string | null;
}
//# sourceMappingURL=user.d.ts.map