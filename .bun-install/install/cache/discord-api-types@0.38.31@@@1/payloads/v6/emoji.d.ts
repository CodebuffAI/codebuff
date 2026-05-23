/**
 * Types extracted from https://discord.com/developers/docs/resources/emoji
 */
import type { APIUser } from './user';
/**
 * Not documented but mentioned
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIPartialEmoji {
    id: string | null;
    name: string | null;
    animated?: boolean;
}
/**
 * https://discord.com/developers/docs/resources/emoji#emoji-object-emoji-structure
 *
 * @deprecated API and Gateway v6 are deprecated and the types will not receive further updates, please update to v8.
 */
export interface APIEmoji extends APIPartialEmoji {
    roles?: string[];
    user?: APIUser;
    require_colons?: boolean;
    managed?: boolean;
    available?: boolean;
}
//# sourceMappingURL=emoji.d.ts.map