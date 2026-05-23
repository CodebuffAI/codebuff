import type { APIApplicationCommand, APIApplicationCommandPermission, APIGuildApplicationCommandPermissions, APIInteractionResponse, APIInteractionResponseCallbackData, ApplicationCommandType } from '../../payloads/v8/index';
import type { _AddUndefinedToPossiblyUndefinedPropertiesOfInterface, _StrictPartial } from '../../utils/internals';
import type { RESTDeleteAPIWebhookWithTokenMessageResult, RESTGetAPIWebhookWithTokenMessageResult, RESTPatchAPIWebhookWithTokenMessageFormDataBody, RESTPatchAPIWebhookWithTokenMessageJSONBody, RESTPatchAPIWebhookWithTokenMessageResult, RESTPostAPIWebhookWithTokenWaitResult } from './webhook';
/**
 * https://discord.com/developers/docs/interactions/application-commands#get-global-application-commands
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIApplicationCommandsResult = APIApplicationCommand[];
/**
 * https://discord.com/developers/docs/interactions/application-commands#get-global-application-command
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIApplicationCommandResult = APIApplicationCommand;
type RESTPostAPIBaseApplicationCommandsJSONBody = _AddUndefinedToPossiblyUndefinedPropertiesOfInterface<Omit<APIApplicationCommand, 'application_id' | 'description' | 'guild_id' | 'id' | 'type' | 'version'>>;
/**
 * https://discord.com/developers/docs/interactions/application-commands#create-global-application-command
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPostAPIChatInputApplicationCommandsJSONBody extends RESTPostAPIBaseApplicationCommandsJSONBody {
    type?: ApplicationCommandType.ChatInput | undefined;
    description: string;
}
/**
 * https://discord.com/developers/docs/interactions/application-commands#create-global-application-command
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPostAPIContextMenuApplicationCommandsJSONBody extends RESTPostAPIBaseApplicationCommandsJSONBody {
    type: ApplicationCommandType.Message | ApplicationCommandType.User;
}
/**
 * https://discord.com/developers/docs/interactions/application-commands#create-global-application-command
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIApplicationCommandsJSONBody = RESTPostAPIChatInputApplicationCommandsJSONBody | RESTPostAPIContextMenuApplicationCommandsJSONBody;
/**
 * https://discord.com/developers/docs/interactions/application-commands#create-global-application-command
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIApplicationCommandsResult = APIApplicationCommand;
/**
 * https://discord.com/developers/docs/interactions/application-commands#edit-global-application-command
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIApplicationCommandJSONBody = _StrictPartial<RESTPostAPIApplicationCommandsJSONBody>;
/**
 * https://discord.com/developers/docs/interactions/application-commands#edit-global-application-command
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIApplicationCommandResult = APIApplicationCommand;
/**
 * https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPutAPIApplicationCommandsJSONBody = RESTPostAPIApplicationCommandsJSONBody[];
/**
 * https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPutAPIApplicationCommandsResult = APIApplicationCommand[];
/**
 * https://discord.com/developers/docs/interactions/application-commands#get-guild-application-commands
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIApplicationGuildCommandsResult = APIApplicationCommand[];
/**
 * https://discord.com/developers/docs/interactions/application-commands#get-guild-application-commands
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIApplicationGuildCommandResult = APIApplicationCommand;
/**
 * https://discord.com/developers/docs/interactions/application-commands#create-guild-application-command
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIApplicationGuildCommandsJSONBody = RESTPostAPIApplicationCommandsJSONBody;
/**
 * https://discord.com/developers/docs/interactions/application-commands#create-guild-application-command
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIApplicationGuildCommandsResult = APIApplicationCommand;
/**
 * https://discord.com/developers/docs/interactions/application-commands#edit-guild-application-command
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIApplicationGuildCommandJSONBody = _StrictPartial<RESTPostAPIApplicationCommandsJSONBody>;
/**
 * https://discord.com/developers/docs/interactions/application-commands#edit-guild-application-command
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIApplicationGuildCommandResult = APIApplicationCommand;
/**
 * https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-guild-application-commands
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPutAPIApplicationGuildCommandsJSONBody = RESTPostAPIApplicationCommandsJSONBody[];
/**
 * https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-guild-application-commands
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPutAPIApplicationGuildCommandsResult = APIApplicationCommand[];
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#create-interaction-response
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIInteractionCallbackJSONBody = APIInteractionResponse;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#create-interaction-response
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIInteractionCallbackFormDataBody = (Record<`files[${bigint}]`, unknown> & {
    /**
     * JSON stringified message body
     */
    payload_json?: string | undefined;
}) | (Record<`files[${bigint}]`, unknown> & RESTPostAPIInteractionCallbackJSONBody);
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#get-original-interaction-response
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIInteractionOriginalResponseResult = RESTGetAPIWebhookWithTokenMessageResult;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#edit-original-interaction-response
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIInteractionOriginalResponseJSONBody = RESTPatchAPIWebhookWithTokenMessageJSONBody;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#edit-original-interaction-response
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIInteractionOriginalResponseFormDataBody = RESTPatchAPIWebhookWithTokenMessageFormDataBody;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#edit-original-interaction-response
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIInteractionOriginalResponseResult = RESTPatchAPIWebhookWithTokenMessageResult;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#delete-original-interaction-response
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIInteractionOriginalResponseResult = RESTDeleteAPIWebhookWithTokenMessageResult;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#create-followup-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIInteractionFollowupJSONBody = APIInteractionResponseCallbackData;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#create-followup-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIInteractionFollowupFormDataBody = (Record<`files[${bigint}]`, unknown> & {
    /**
     * JSON stringified message body
     */
    payload_json?: string | undefined;
}) | (Record<`files[${bigint}]`, unknown> & RESTPostAPIInteractionFollowupJSONBody);
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#create-followup-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPostAPIInteractionFollowupResult = RESTPostAPIWebhookWithTokenWaitResult;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#get-followup-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIInteractionFollowupResult = RESTGetAPIWebhookWithTokenMessageResult;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#edit-followup-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIInteractionFollowupJSONBody = RESTPatchAPIWebhookWithTokenMessageJSONBody;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#edit-followup-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIInteractionFollowupFormDataBody = RESTPatchAPIWebhookWithTokenMessageFormDataBody;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#edit-followup-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPatchAPIInteractionFollowupResult = RESTPatchAPIWebhookWithTokenMessageResult;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#delete-followup-message
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTDeleteAPIInteractionFollowupResult = RESTDeleteAPIWebhookWithTokenMessageResult;
/**
 * https://discord.com/developers/docs/interactions/application-commands#get-guild-application-command-permissions
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIGuildApplicationCommandsPermissionsResult = APIGuildApplicationCommandPermissions[];
/**
 * https://discord.com/developers/docs/interactions/application-commands#get-application-command-permissions
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTGetAPIApplicationCommandPermissionsResult = APIGuildApplicationCommandPermissions;
/**
 * https://discord.com/developers/docs/interactions/application-commands#edit-application-command-permissions
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface RESTPutAPIApplicationCommandPermissionsJSONBody {
    permissions: APIApplicationCommandPermission[];
}
/**
 * https://discord.com/developers/docs/interactions/application-commands#edit-application-command-permissions
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPutAPIApplicationCommandPermissionsResult = APIGuildApplicationCommandPermissions;
/**
 * https://discord.com/developers/docs/interactions/application-commands#batch-edit-application-command-permissions
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPutAPIGuildApplicationCommandsPermissionsJSONBody = Pick<APIGuildApplicationCommandPermissions, 'id' | 'permissions'>[];
/**
 * https://discord.com/developers/docs/interactions/application-commands#batch-edit-application-command-permissions
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type RESTPutAPIGuildApplicationCommandsPermissionsResult = APIGuildApplicationCommandPermissions[];
export {};
//# sourceMappingURL=interactions.d.ts.map