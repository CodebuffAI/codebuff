import type { APIGuild, APITemplate } from '../../payloads/v8/index';
import type { _StrictPartial } from '../../utils/internals';
/**
 * https://discord.com/developers/docs/resources/template#get-template
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPITemplateResult = APITemplate;
/**
 * https://discord.com/developers/docs/resources/template#create-guild-from-template
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPostAPITemplateCreateGuildJSONBody {
    /**
     * Name of the guild (2-100 characters)
     */
    name: string;
    /**
     * base64 1024x1024 png/jpeg image for the guild icon
     *
     * See https://discord.com/developers/docs/reference#image-data
     */
    icon?: string | undefined;
}
/**
 * https://discord.com/developers/docs/resources/template#create-guild-from-template
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPITemplateCreateGuildResult = APIGuild;
/**
 * https://discord.com/developers/docs/resources/template#get-guild-templates
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIGuildTemplatesResult = APITemplate[];
/**
 * https://discord.com/developers/docs/resources/template#create-guild-template
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
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
 * https://discord.com/developers/docs/resources/template#create-guild-template
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIGuildTemplatesResult = APITemplate;
/**
 * https://discord.com/developers/docs/resources/template#sync-guild-template
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPutAPIGuildTemplateSyncResult = APITemplate;
/**
 * https://discord.com/developers/docs/resources/template#modify-guild-template
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIGuildTemplateJSONBody = _StrictPartial<RESTPostAPIGuildTemplatesJSONBody>;
/**
 * https://discord.com/developers/docs/resources/template#modify-guild-template
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIGuildTemplateResult = APITemplate;
/**
 * https://discord.com/developers/docs/resources/template#delete-guild-template
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIGuildTemplateResult = APITemplate;
//# sourceMappingURL=template.d.ts.map