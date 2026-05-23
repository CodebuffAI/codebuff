/**
 * Types extracted from https://discord.com/developers/docs/resources/emoji
 */
import type { Snowflake } from '../../globals';
import type { _NonNullableFields } from '../../utils/internals';
import type { APIRole } from './permissions';
import type { APIUser } from './user';
/**
 * Not documented but mentioned
 */
export interface APIPartialEmoji {
    /**
     * Emoji id
     */
    id: Snowflake | null;
    /**
     * Emoji name (can be null only in reaction emoji objects)
     */
    name: string | null;
    /**
     * Whether this emoji is animated
     */
    animated?: boolean;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/emoji#emoji-object-emoji-structure}
 */
export interface APIEmoji extends APIPartialEmoji {
    /**
     * Roles this emoji is whitelisted to
     */
    roles?: APIRole['id'][];
    /**
     * User that created this emoji
     */
    user?: APIUser;
    /**
     * Whether this emoji must be wrapped in colons
     */
    require_colons?: boolean;
    /**
     * Whether this emoji is managed
     */
    managed?: boolean;
    /**
     * Whether this emoji can be used, may be false due to loss of Server Boosts
     */
    available?: boolean;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/emoji#emoji-object-applicationowned-emoji}
 */
export type APIApplicationEmoji = _NonNullableFields<Required<Pick<APIEmoji, 'animated' | 'id' | 'name' | 'user'>>> & {
    /**
     * Roles allowed to use this emoji.
     *
     * @remarks Always empty.
     */
    roles: [];
    /**
     * Whether this emoji must be wrapped in colons.
     *
     * @remarks Always `true`.
     */
    require_colons: true;
    /**
     * Whether this emoji is managed.
     *
     * @remarks Always `false`.
     */
    managed: false;
    /**
     * Whether this emoji is available.
     *
     * @remarks Always `true`.
     */
    available: true;
};
//# sourceMappingURL=emoji.d.ts.map