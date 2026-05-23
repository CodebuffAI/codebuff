import type { Snowflake } from '../../globals';
import type { APISoundboardSound } from '../../payloads/v10/index';
/**
 * @see {@link https://discord.com/developers/docs/resources/soundboard#send-soundboard-sound}
 */
export type RESTPostAPISendSoundboardSoundResult = APISoundboardSound;
/**
 * @see {@link https://discord.com/developers/docs/resources/soundboard#send-soundboard-sound-json-params}
 */
export interface RESTPostAPISoundboardSendSoundJSONBody {
    /**
     * The id of the soundboard sound to play
     */
    sound_id: Snowflake;
    /**
     * The id of the guild the soundboard sound is from, required to play sounds from different servers
     */
    source_guild_id?: Snowflake | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/soundboard#list-soundboard-default-sounds}
 */
export type RESTGetAPISoundboardDefaultSoundsResult = APISoundboardSound[];
/**
 * @see {@link https://discord.com/developers/docs/resources/soundboard#list-guild-soundboard-sounds}
 */
export interface RESTGetAPIGuildSoundboardSoundsResult {
    items: APISoundboardSound[];
}
/**
 * @see {@link https://discord.com/developers/docs/resources/soundboard#get-guild-soundboard-sound}
 */
export type RESTGetAPIGuildSoundboardSoundResult = APISoundboardSound;
/**
 * @see {@link https://discord.com/developers/docs/resources/soundboard#create-guild-soundboard-sound-json-params}
 */
export interface RESTPostAPIGuildSoundboardSoundJSONBody {
    /**
     * The name of the soundboard sound (2-32 characters)
     */
    name: string;
    /**
     * The data uri of the mp3 or ogg sound data, base64 encoded, similar to image data
     *
     * @see {@link https://discord.com/developers/docs/reference#image-data}
     */
    sound: string;
    /**
     * The volume of the soundboard sound, from 0 to 1
     *
     * @defaultValue `1`
     */
    volume?: number | null | undefined;
    /**
     * The id of the custom emoji for the soundboard sound
     */
    emoji_id?: Snowflake | null | undefined;
    /**
     * The unicode character of a standard emoji for the soundboard sound
     */
    emoji_name?: string | null | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/soundboard#create-guild-soundboard-sound}
 */
export type RESTPostAPIGuildSoundboardSoundResult = APISoundboardSound;
/**
 * @see {@link https://discord.com/developers/docs/resources/soundboard#modify-guild-soundboard-sound-json-params}
 */
export interface RESTPatchAPIGuildSoundboardSoundJSONBody {
    /**
     * The name of the soundboard sound (2-32 characters)
     */
    name?: string | undefined;
    /**
     * The volume of the soundboard sound, from 0 to 1
     *
     * @defaultValue `1`
     */
    volume?: number | null | undefined;
    /**
     * The id of the custom emoji for the soundboard sound
     */
    emoji_id?: Snowflake | null | undefined;
    /**
     * The unicode character of a standard emoji for the soundboard sound
     */
    emoji_name?: string | null | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/soundboard#modify-guild-soundboard-sound}
 */
export type RESTPatchAPIGuildSoundboardSoundResult = APISoundboardSound;
/**
 * @see {@link https://discord.com/developers/docs/resources/soundboard#delete-guild-soundboard-sound}
 */
export type RESTDeleteAPIGuildSoundboardSoundResult = never;
//# sourceMappingURL=soundboard.d.ts.map