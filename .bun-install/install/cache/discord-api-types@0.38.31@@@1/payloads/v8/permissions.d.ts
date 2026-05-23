/**
 * Types extracted from https://discord.com/developers/docs/topics/permissions
 */
import type { Permissions, Snowflake } from '../../globals';
/**
 * https://discord.com/developers/docs/topics/permissions#role-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIRole {
    /**
     * Role id
     */
    id: Snowflake;
    /**
     * Role name
     */
    name: string;
    /**
     * Integer representation of hexadecimal color code
     */
    color: number;
    /**
     * If this role is pinned in the user listing
     */
    hoist: boolean;
    /**
     * The role icon hash
     */
    icon?: string | null;
    /**
     * The role unicode emoji as a standard emoji
     */
    unicode_emoji?: string | null;
    /**
     * Position of this role
     */
    position: number;
    /**
     * Permission bit set
     *
     * See https://en.wikipedia.org/wiki/Bit_field
     */
    permissions: Permissions;
    /**
     * Whether this role is managed by an integration
     */
    managed: boolean;
    /**
     * Whether this role is mentionable
     */
    mentionable: boolean;
    /**
     * The tags this role has
     */
    tags?: APIRoleTags;
}
/**
 * https://discord.com/developers/docs/topics/permissions#role-object-role-tags-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIRoleTags {
    /**
     * The id of the bot this role belongs to
     */
    bot_id?: Snowflake;
    /**
     * Whether this is the guild's premium subscriber role
     */
    premium_subscriber?: null;
    /**
     * The id of the integration this role belongs to
     */
    integration_id?: Snowflake;
}
//# sourceMappingURL=permissions.d.ts.map