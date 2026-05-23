import type { Snowflake } from '../../globals';
import type { APIEmoji } from '../../payloads/v8/index';
/**
 * https://discord.com/developers/docs/resources/emoji#list-guild-emojis
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIGuildEmojisResult = APIEmoji[];
/**
 * https://discord.com/developers/docs/resources/emoji#get-guild-emoji
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIGuildEmojiResult = APIEmoji;
/**
 * https://discord.com/developers/docs/resources/emoji#create-guild-emoji-json-params
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPostAPIGuildEmojiJSONBody {
    /**
     * Name of the emoji
     */
    name: string;
    /**
     * The 128x128 emoji image
     *
     * https://discord.com/developers/docs/reference#image-data
     */
    image: string;
    /**
     * Roles for which this emoji will be whitelisted
     */
    roles?: Snowflake[] | undefined;
}
/**
 * https://discord.com/developers/docs/resources/emoji#create-guild-emoji
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIGuildEmojiResult = APIEmoji;
/**
 * https://discord.com/developers/docs/resources/emoji#modify-guild-emoji
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPatchAPIGuildEmojiJSONBody {
    /**
     * Name of the emoji
     */
    name?: string | undefined;
    /**
     * Roles for which this emoji will be whitelisted
     */
    roles?: Snowflake[] | null | undefined;
}
/**
 * https://discord.com/developers/docs/resources/emoji#modify-guild-emoji
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIGuildEmojiResult = APIEmoji;
/**
 * https://discord.com/developers/docs/resources/emoji#delete-guild-emoji
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIGuildEmojiResult = never;
//# sourceMappingURL=emoji.d.ts.map