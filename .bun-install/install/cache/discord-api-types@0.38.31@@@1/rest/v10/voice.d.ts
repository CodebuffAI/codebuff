import type { Snowflake } from '../../globals';
import type { APIVoiceRegion, APIVoiceState } from '../../payloads/v10/index';
/**
 * @see {@link https://discord.com/developers/docs/resources/voice#list-voice-regions}
 */
export type RESTGetAPIVoiceRegionsResult = APIVoiceRegion[];
/**
 * @deprecated This was exported with the wrong name, use {@link RESTGetAPIVoiceRegionsResult} instead
 */
export type GetAPIVoiceRegionsResult = RESTGetAPIVoiceRegionsResult;
/**
 * @see {@link https://discord.com/developers/docs/resources/voice#get-current-user-voice-state}
 */
export type RESTGetAPIGuildVoiceStateCurrentMemberResult = APIVoiceState;
/**
 * @see {@link https://discord.com/developers/docs/resources/voice#get-user-voice-state}
 */
export type RESTGetAPIGuildVoiceStateUserResult = APIVoiceState;
/**
 * @see {@link https://discord.com/developers/docs/resources/voice#modify-current-user-voice-state}
 */
export interface RESTPatchAPIGuildVoiceStateCurrentMemberJSONBody {
    /**
     * The id of the channel the user is currently in
     */
    channel_id?: Snowflake | undefined;
    /**
     * Toggles the user's suppress state
     */
    suppress?: boolean | undefined;
    /**
     * Sets the user's request to speak
     */
    request_to_speak_timestamp?: string | null | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/voice#modify-current-user-voice-state}
 */
export type RESTPatchAPIGuildVoiceStateCurrentMemberResult = never;
/**
 * @see {@link https://discord.com/developers/docs/resources/voice#modify-user-voice-state}
 */
export interface RESTPatchAPIGuildVoiceStateUserJSONBody {
    /**
     * The id of the channel the user is currently in
     */
    channel_id: Snowflake;
    /**
     * Toggles the user's suppress state
     */
    suppress?: boolean | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/voice#modify-user-voice-state}
 */
export type RESTPatchAPIGuildVoiceStateUserResult = never;
//# sourceMappingURL=voice.d.ts.map