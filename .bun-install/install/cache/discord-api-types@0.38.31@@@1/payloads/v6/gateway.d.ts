/**
 * Types extracted from https://discord.com/developers/docs/topics/gateway
 */
import type { APIEmoji } from './emoji';
import type { APIUser } from './user';
/**
 * https://discord.com/developers/docs/topics/gateway#get-gateway
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIGatewayInfo {
    url: string;
}
/**
 * https://discord.com/developers/docs/topics/gateway#get-gateway-bot
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIGatewayBotInfo extends APIGatewayInfo {
    shards: number;
    session_start_limit: APIGatewaySessionStartLimit;
}
/**
 * https://discord.com/developers/docs/topics/gateway#session-start-limit-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIGatewaySessionStartLimit {
    total: number;
    remaining: number;
    reset_after: number;
}
/**
 * https://discord.com/developers/docs/topics/gateway#presence-update-presence-update-event-fields
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface GatewayPresenceUpdate {
    user: Partial<APIUser> & {
        id: string;
    };
    roles?: string[];
    game?: GatewayActivity | null;
    guild_id?: string;
    status?: PresenceUpdateStatus;
    activities?: GatewayActivity[];
    client_status?: GatewayPresenceClientStatus;
    premium_since?: string | null;
    nick?: string | null;
}
/**
 * @deprecated API v6 is deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum PresenceUpdateStatus {
    DoNotDisturb = "dnd",
    Idle = "idle",
    Invisible = "invisible",
    Offline = "offline",
    Online = "online"
}
/**
 * https://discord.com/developers/docs/topics/gateway#client-status-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type GatewayPresenceClientStatus = Partial<Record<'desktop' | 'mobile' | 'web', PresenceUpdateStatus>>;
/**
 * https://discord.com/developers/docs/topics/gateway#activity-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface GatewayActivity {
    name: string;
    type: ActivityType;
    url?: string | null;
    created_at: number;
    timestamps?: GatewayActivityTimestamps;
    application_id?: string;
    details?: string | null;
    state?: string | null;
    emoji?: GatewayActivityEmoji;
    party?: GatewayActivityParty;
    assets?: GatewayActivityAssets;
    secrets?: GatewayActivitySecrets;
    instance?: boolean;
    flags?: ActivityFlags;
}
/**
 * https://discord.com/developers/docs/topics/gateway#activity-object-activity-types
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum ActivityType {
    Game = 0,
    Streaming = 1,
    Listening = 2,
    Custom = 4,
    Competing = 5
}
/**
 * https://discord.com/developers/docs/topics/gateway#activity-object-activity-timestamps
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface GatewayActivityTimestamps {
    start?: number;
    end?: number;
}
/**
 * https://discord.com/developers/docs/topics/gateway#activity-object-activity-emoji
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type GatewayActivityEmoji = Partial<Pick<APIEmoji, 'animated' | 'name'>> & Pick<APIEmoji, 'id'>;
/**
 * https://discord.com/developers/docs/topics/gateway#activity-object-activity-party
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface GatewayActivityParty {
    id?: string;
    size?: [currentSize: number, maxSize: number];
}
/**
 * https://discord.com/developers/docs/topics/gateway#activity-object-activity-assets
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type GatewayActivityAssets = Partial<Record<'large_image' | 'large_text' | 'small_image' | 'small_text', string>>;
/**
 * https://discord.com/developers/docs/topics/gateway#activity-object-activity-secrets
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export type GatewayActivitySecrets = Partial<Record<'join' | 'match' | 'spectate', string>>;
/**
 * https://discord.com/developers/docs/topics/gateway#activity-object-activity-flags
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export declare enum ActivityFlags {
    INSTANCE = 1,
    JOIN = 2,
    SPECTATE = 4,
    JOIN_REQUEST = 8,
    SYNC = 16,
    PLAY = 32
}
//# sourceMappingURL=gateway.d.ts.map