/**
 * Types extracted from https://discord.com/developers/docs/resources/voice
 */
import type { Snowflake } from '../../globals';
import type { APIGuildMember } from './guild';
/**
 * https://discord.com/developers/docs/resources/voice#voice-state-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface GatewayVoiceState {
    /**
     * The guild id this voice state is for
     */
    guild_id?: Snowflake;
    /**
     * The channel id this user is connected to
     */
    channel_id: Snowflake | null;
    /**
     * The user id this voice state is for
     */
    user_id: Snowflake;
    /**
     * The guild member this voice state is for
     *
     * See https://discord.com/developers/docs/resources/guild#guild-member-object
     */
    member?: APIGuildMember;
    /**
     * The session id for this voice state
     */
    session_id: string;
    /**
     * Whether this user is deafened by the server
     */
    deaf: boolean;
    /**
     * Whether this user is muted by the server
     */
    mute: boolean;
    /**
     * Whether this user is locally deafened
     */
    self_deaf: boolean;
    /**
     * Whether this user is locally muted
     */
    self_mute: boolean;
    /**
     * Whether this user is streaming using "Go Live"
     */
    self_stream?: boolean;
    /**
     * Whether this user's camera is enabled
     */
    self_video: boolean;
    /**
     * Whether this user is muted by the current user
     */
    suppress: boolean;
    /**
     * The time at which the user requested to speak
     */
    request_to_speak_timestamp: string | null;
}
/**
 * https://discord.com/developers/docs/resources/voice#voice-region-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIVoiceRegion {
    /**
     * Unique ID for the region
     */
    id: string;
    /**
     * Name of the region
     */
    name: string;
    /**
     * `true` for a single server that is closest to the current user's client
     */
    optimal: boolean;
    /**
     * Whether this is a deprecated voice region (avoid switching to these)
     */
    deprecated: boolean;
    /**
     * Whether this is a custom voice region (used for events/etc)
     */
    custom: boolean;
}
//# sourceMappingURL=voice.d.ts.map