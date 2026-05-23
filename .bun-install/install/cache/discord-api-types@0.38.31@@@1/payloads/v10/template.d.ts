/**
 * Types extracted from https://discord.com/developers/docs/resources/guild-template
 */
import type { Snowflake } from '../../globals';
import type { Locale } from '../../rest/common';
import type { RESTPostAPIGuildsJSONBody } from '../../rest/v10/index';
import type { APIUser } from './user';
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-template#guild-template-object}
 */
export interface APITemplate {
    /**
     * The template code (unique ID)
     */
    code: string;
    /**
     * Template name
     */
    name: string;
    /**
     * The description for the template
     */
    description: string | null;
    /**
     * Number of times this template has been used
     */
    usage_count: number;
    /**
     * The ID of the user who created the template
     */
    creator_id: Snowflake;
    /**
     * The user who created the template
     *
     * @see {@link https://discord.com/developers/docs/resources/user#user-object}
     */
    creator: APIUser;
    /**
     * When this template was created
     */
    created_at: string;
    /**
     * When this template was last synced to the source guild
     */
    updated_at: string;
    /**
     * The ID of the guild this template is based on
     */
    source_guild_id: Snowflake;
    /**
     * The guild snapshot this template contains
     */
    serialized_source_guild: APITemplateSerializedSourceGuild;
    /**
     * Whether the template has unsynced changes
     */
    is_dirty: boolean | null;
}
export interface APITemplateSerializedSourceGuild extends Omit<RESTPostAPIGuildsJSONBody, 'icon'> {
    description: string | null;
    preferred_locale: Locale;
    icon_hash: string | null;
}
//# sourceMappingURL=template.d.ts.map