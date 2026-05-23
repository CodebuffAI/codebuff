/**
 * Types extracted from https://discord.com/developers/docs/resources/soundboard
 */
import type { Snowflake } from '../../globals';
import type { APIUser } from './user';
/**
 * @see {@link https://discord.com/developers/docs/resources/soundboard#soundboard-sound-object}
 */
export interface APISoundboardSound {
    /**
     * The name of this sound
     */
    name: string;
    /**
     * The id of this sound
     */
    sound_id: Snowflake;
    /**
     * The volume of this sound, from 0 to 1
     */
    volume: number;
    /**
     * The id of this sound's custom emoji
     */
    emoji_id: Snowflake | null;
    /**
     * The unicode character of this sound's standard emoji
     */
    emoji_name: string | null;
    /**
     * The id of the guild that this sound is in
     */
    guild_id?: Snowflake;
    /**
     * Whether this sound can be used (for guild sounds), may be false due to loss of Server Boosts
     */
    available: boolean;
    /**
     * The user who created this sound
     */
    user?: APIUser;
}
//# sourceMappingURL=soundboard.d.ts.map