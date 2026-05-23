/**
 * Types extracted from https://discord.com/developers/docs/resources/user
 */
import type { APIGuildIntegration } from './guild';
/**
 * https://discord.com/developers/docs/resources/user#user-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIUser {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    bot?: boolean;
    system?: boolean;
    mfa_enabled?: boolean;
    locale?: string;
    verified?: boolean;
    email?: string | null;
    flags?: UserFlags;
    premium_type?: UserPremiumType;
    public_flags?: UserFlags;
}
/**
 * https://discord.com/developers/docs/resources/user#user-object-user-flags
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum UserFlags {
    None = 0,
    DiscordEmployee = 1,
    PartneredServerOwner = 2,
    DiscordHypeSquadEvents = 4,
    BugHunterLevel1 = 8,
    HypeSquadHouseBravery = 64,
    HypeSquadHouseBrilliance = 128,
    HypeSquadHouseBalance = 256,
    EarlySupporter = 512,
    TeamUser = 1024,
    System = 4096,
    BugHunterLevel2 = 16384,
    VerifiedBot = 65536,
    EarlyVerifiedBotDeveloper = 131072
}
/**
 * https://discord.com/developers/docs/resources/user#user-object-premium-types
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum UserPremiumType {
    None = 0,
    NitroClassic = 1,
    Nitro = 2
}
/**
 * https://discord.com/developers/docs/resources/user#connection-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIConnection {
    id: string;
    name: string;
    type: string;
    revoked?: boolean;
    integrations?: Partial<APIGuildIntegration>[];
    verified: boolean;
    friend_sync: boolean;
    show_activity: boolean;
    visibility: ConnectionVisibility;
}
/**
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum ConnectionVisibility {
    None = 0,
    Everyone = 1
}
//# sourceMappingURL=user.d.ts.map