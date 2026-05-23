/**
 * Types extracted from https://discord.com/developers/docs/resources/user
 */
import type { Snowflake } from '../../globals';
import type { APIGuildIntegration } from './guild';
/**
 * https://discord.com/developers/docs/resources/user#user-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
     * The user's 4-digit discord-tag
     */
    discriminator: string;
    /**
     * The user's avatar hash
     *
     * See https://discord.com/developers/docs/reference#image-formatting
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
     * See https://discord.com/developers/docs/reference#image-formatting
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
     * See https://discord.com/developers/docs/resources/user#user-object-user-flags
     */
    flags?: UserFlags;
    /**
     * The type of Nitro subscription on a user's account
     *
     * See https://discord.com/developers/docs/resources/user#user-object-premium-types
     */
    premium_type?: UserPremiumType;
    /**
     * The public flags on a user's account
     *
     * See https://discord.com/developers/docs/resources/user#user-object-user-flags
     */
    public_flags?: UserFlags;
}
/**
 * https://discord.com/developers/docs/resources/user#user-object-user-flags
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
     * HypeSquad Events Coordinator
     */
    Hypesquad = 4,
    /**
     * Bug Hunter Level 1
     */
    BugHunterLevel1 = 8,
    /**
     * House Bravery Member
     */
    HypeSquadOnlineHouse1 = 64,
    /**
     * House Brilliance Member
     */
    HypeSquadOnlineHouse2 = 128,
    /**
     * House Balance MemberW
     */
    HypeSquadOnlineHouse3 = 256,
    /**
     * Early Nitro Supporter
     */
    PremiumEarlySupporter = 512,
    /**
     * User is a [team](https://discord.com/developers/docs/topics/teams)
     */
    TeamPseudoUser = 1024,
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
     * Discord Certified Moderator
     */
    CertifiedModerator = 262144,
    /**
     * Bot uses only [HTTP interactions](https://discord.com/developers/docs/interactions/receiving-and-responding#receiving-an-interaction) and is shown in the online member list
     */
    BotHTTPInteractions = 524288,
    /**
     * User has been identified as spammer
     *
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    Spammer = 1048576,
    /**
     * User's account has been quarantined based on recent activity
     *
     * @unstable This user flag is currently not documented by Discord but has a known value which we will try to keep up to date.
     */
    Quarantined = 17592186044416
}
/**
 * https://discord.com/developers/docs/resources/user#user-object-premium-types
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum UserPremiumType {
    None = 0,
    NitroClassic = 1,
    Nitro = 2
}
/**
 * https://discord.com/developers/docs/resources/user#connection-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
     */
    type: string;
    /**
     * Whether the connection is revoked
     */
    revoked?: boolean;
    /**
     * An array of partial server integrations
     *
     * See https://discord.com/developers/docs/resources/guild#integration-object
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
     * Visibility of this connection
     *
     * See https://discord.com/developers/docs/resources/user#connection-object-visibility-types
     */
    visibility: ConnectionVisibility;
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
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
//# sourceMappingURL=user.d.ts.map