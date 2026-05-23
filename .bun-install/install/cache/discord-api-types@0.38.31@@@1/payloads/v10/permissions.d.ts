/**
 * Types extracted from https://discord.com/developers/docs/topics/permissions
 */
import type { Permissions, Snowflake } from '../../globals';
/**
 * @see {@link https://discord.com/developers/docs/topics/permissions#role-object}
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
     *
     * @remarks `color` will still be returned by the API, but using the `colors` field is recommended when doing requests.
     */
    color: number;
    /**
     * The role's colors
     */
    colors?: APIRoleColors;
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
     * @see {@link https://en.wikipedia.org/wiki/Bit_field}
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
    /**
     * Role flags
     */
    flags: RoleFlags;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/permissions#role-object-role-tags-structure}
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
    /**
     * The id of this role's subscription sku and listing
     */
    subscription_listing_id?: Snowflake;
    /**
     * Whether this role is available for purchase
     */
    available_for_purchase?: null;
    /**
     * Whether this role is a guild's linked role
     */
    guild_connections?: null;
}
/**
 * @see {@link https://discord.com/developers/docs/topics/permissions#role-object-role-flags}
 */
export declare enum RoleFlags {
    /**
     * Role can be selected by members in an onboarding prompt
     */
    InPrompt = 1
}
/**
 * @see {@link https://discord.com/developers/docs/topics/permissions#role-colors-object}
 */
export interface APIRoleColors {
    /**
     * The primary color for the role
     */
    primary_color: number;
    /**
     * The secondary color for the role, this will make the role a gradient between the other provided colors
     */
    secondary_color: number | null;
    /**
     * The tertiary color for the role, this will turn the gradient into a holographic style
     *
     * @remarks When sending `tertiary_color` the API enforces the role color to be a holographic style with values of `primary_color = 11127295`, `secondary_color = 16759788`, and `tertiary_color = 16761760`.
     */
    tertiary_color: number | null;
}
//# sourceMappingURL=permissions.d.ts.map