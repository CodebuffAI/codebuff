import type { APIGuild, APITemplate } from '../../payloads/v10/index';
import type { _StrictPartial } from '../../utils/internals';
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-template#get-guild-template}
 */
export type RESTGetAPITemplateResult = APITemplate;
/**
 * @see {@link https://discord.com/developers/docs/change-log#guild-create-deprecation}
 * @deprecated
 */
export interface RESTPostAPITemplateCreateGuildJSONBody {
    /**
     * Name of the guild (2-100 characters)
     */
    name: string;
    /**
     * base64 1024x1024 png/jpeg image for the guild icon
     *
     * @see {@link https://discord.com/developers/docs/reference#image-data}
     */
    icon?: string | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/change-log#guild-create-deprecation}
 * @deprecated
 */
export type RESTPostAPITemplateCreateGuildResult = APIGuild;
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-template#get-guild-templates}
 */
export type RESTGetAPIGuildTemplatesResult = APITemplate[];
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-template#create-guild-template}
 */
export interface RESTPostAPIGuildTemplatesJSONBody {
    /**
     * Name of the template (1-100 characters)
     */
    name: string;
    /**
     * Description for the template (0-120 characters)
     */
    description?: string | null | undefined;
}
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-template#create-guild-template}
 */
export type RESTPostAPIGuildTemplatesResult = APITemplate;
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-template#sync-guild-template}
 */
export type RESTPutAPIGuildTemplateSyncResult = APITemplate;
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-template#modify-guild-template}
 */
export type RESTPatchAPIGuildTemplateJSONBody = _StrictPartial<RESTPostAPIGuildTemplatesJSONBody>;
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-template#modify-guild-template}
 */
export type RESTPatchAPIGuildTemplateResult = APITemplate;
/**
 * @see {@link https://discord.com/developers/docs/resources/guild-template#delete-guild-template}
 */
export type RESTDeleteAPIGuildTemplateResult = APITemplate;
//# sourceMappingURL=template.d.ts.map