/**
 * Types extracted from https://discord.com/developers/docs/resources/sticker
 */
import type { Snowflake } from '../../globals';
import type { APIUser } from './user';
/**
 * https://discord.com/developers/docs/resources/sticker#sticker-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APISticker {
    /**
     * ID of the sticker
     */
    id: Snowflake;
    /**
     * For standard stickers, ID of the pack the sticker is from
     */
    pack_id?: Snowflake;
    /**
     * Name of the sticker
     */
    name: string;
    /**
     * Description of the sticker
     */
    description: string | null;
    /**
     * For guild stickers, the Discord name of a unicode emoji representing the sticker's expression. for standard stickers, a comma-separated list of related expressions.
     */
    tags: string;
    /**
     * Previously the sticker asset hash, now an empty string
     *
     * @deprecated
     */
    asset: '';
    /**
     * Type of sticker
     *
     * See https://discord.com/developers/docs/resources/sticker#sticker-object-sticker-types
     */
    type: StickerType;
    /**
     * Type of sticker format
     *
     * See https://discord.com/developers/docs/resources/sticker#sticker-object-sticker-format-types
     */
    format_type: StickerFormatType;
    /**
     * Whether this guild sticker can be used, may be false due to loss of Server Boosts
     */
    available?: boolean;
    /**
     * ID of the guild that owns this sticker
     */
    guild_id?: Snowflake;
    /**
     * The user that uploaded the guild sticker
     */
    user?: APIUser;
    /**
     * The standard sticker's sort order within its pack
     */
    sort_value?: number;
}
/**
 * https://discord.com/developers/docs/resources/sticker#sticker-object-sticker-types
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum StickerType {
    /**
     * An official sticker in a pack, part of Nitro or in a removed purchasable pack
     */
    Standard = 1,
    /**
     * A sticker uploaded to a Boosted guild for the guild's members
     */
    Guild = 2
}
/**
 * https://discord.com/developers/docs/resources/sticker#sticker-object-sticker-format-types
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum StickerFormatType {
    PNG = 1,
    APNG = 2,
    Lottie = 3
}
/**
 * https://discord.com/developers/docs/resources/sticker#sticker-item-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIStickerItem = Pick<APISticker, 'format_type' | 'id' | 'name'>;
/**
 * https://discord.com/developers/docs/resources/sticker#sticker-pack-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIStickerPack {
    /**
     * ID of the sticker pack
     */
    id: Snowflake;
    /**
     * The stickers in the pack
     */
    stickers: APISticker[];
    /**
     * Name of the sticker pack
     */
    name: string;
    /**
     * ID of the pack's SKU
     */
    sku_id: Snowflake;
    /**
     * ID of a sticker in the pack which is shown as the pack's icon
     */
    cover_sticker_id?: Snowflake;
    /**
     * Description of the sticker pack
     */
    description: string;
    /**
     * ID of the sticker pack's banner image
     */
    banner_asset_id?: Snowflake;
}
//# sourceMappingURL=sticker.d.ts.map