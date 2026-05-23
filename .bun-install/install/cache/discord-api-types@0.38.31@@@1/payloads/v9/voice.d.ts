/**
 * Types extracted from https://discord.com/developers/docs/resources/voice
 */
import type { Snowflake } from '../../globals';
import type { APIGuildMember } from './guild';
/**
 * @see {@link https://discord.com/developers/docs/resources/voice#voice-state-object}
 * @deprecated This is deprecated, use {@link APIVoiceState}
 */
export type GatewayVoiceState = APIVoiceState;
export interface APIBaseVoiceState {
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
     * @remarks The member field will have `joined_at` set to `null` if the member was invited as a guest.
     * @see {@link https://discord.com/developers/docs/resources/guild#guild-member-object}
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
 * @see {@link https://discord.com/developers/docs/resources/voice#voice-state-object}
 */
export interface APIVoiceState extends APIBaseVoiceState {
    /**
     * The guild id this voice state is for
     */
    guild_id?: Snowflake;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/voice#voice-region-object}
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