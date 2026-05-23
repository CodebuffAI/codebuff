/**
 * Types extracted from https://discord.com/developers/docs/resources/template
 */
import type { Snowflake } from '../../globals';
import type { RESTPostAPIGuildsJSONBody } from '../../rest/v8/index';
import type { APIUser } from './user';
/**
 * https://discord.com/developers/docs/resources/template#template-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
     * See https://discord.com/developers/docs/resources/user#user-object
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
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APITemplateSerializedSourceGuild extends Omit<RESTPostAPIGuildsJSONBody, 'icon'> {
    description: string | null;
    preferred_locale: string;
    icon_hash: string | null;
}
//# sourceMappingURL=template.d.ts.map