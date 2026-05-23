/**
 * Types extracted from https://discord.com/developers/docs/resources/voice
 */
import type { APIGuildMember } from './guild';
/**
 * https://discord.com/developers/docs/resources/voice#voice-state-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface GatewayVoiceState {
    guild_id?: string;
    channel_id: string | null;
    user_id: string;
    member?: APIGuildMember;
    session_id: string;
    deaf: boolean;
    mute: boolean;
    self_deaf: boolean;
    self_mute: boolean;
    self_stream?: boolean;
    self_video: boolean;
    suppress: boolean;
}
/**
 * https://discord.com/developers/docs/resources/voice#voice-region-object
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIVoiceRegion {
    id: string;
    name: string;
    vip: boolean;
    optimal: boolean;
    deprecated: boolean;
    custom: boolean;
}
//# sourceMappingURL=voice.d.ts.map