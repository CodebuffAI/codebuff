import type { Snowflake } from '../../../../globals';
import type { APIAttachment, APIRole, APIUser } from '../../index';
import type { APIApplicationCommandInteractionWrapper, APIInteractionDataResolvedChannel, APIInteractionDataResolvedGuildMember, ApplicationCommandType } from '../applicationCommands';
import type { APIDMInteractionWrapper, APIGuildInteractionWrapper } from '../base';
import type { APIApplicationCommandAttachmentOption, APIApplicationCommandInteractionDataAttachmentOption } from './_chatInput/attachment';
import type { APIApplicationCommandBooleanOption, APIApplicationCommandInteractionDataBooleanOption } from './_chatInput/boolean';
import type { APIApplicationCommandChannelOption, APIApplicationCommandInteractionDataChannelOption } from './_chatInput/channel';
import type { APIApplicationCommandIntegerOption, APIApplicationCommandInteractionDataIntegerOption } from './_chatInput/integer';
import type { APIApplicationCommandInteractionDataMentionableOption, APIApplicationCommandMentionableOption } from './_chatInput/mentionable';
import type { APIApplicationCommandInteractionDataNumberOption, APIApplicationCommandNumberOption } from './_chatInput/number';
import type { APIApplicationCommandInteractionDataRoleOption, APIApplicationCommandRoleOption } from './_chatInput/role';
import type { APIApplicationCommandInteractionDataStringOption, APIApplicationCommandStringOption } from './_chatInput/string';
import type { APIApplicationCommandInteractionDataSubcommandOption, APIApplicationCommandSubcommandOption } from './_chatInput/subcommand';
import type { APIApplicationCommandInteractionDataSubcommandGroupOption, APIApplicationCommandSubcommandGroupOption } from './_chatInput/subcommandGroup';
import type { APIApplicationCommandInteractionDataUserOption, APIApplicationCommandUserOption } from './_chatInput/user';
import type { APIBaseApplicationCommandInteractionData } from './internals';
export * from './_chatInput/attachment';
export * from './_chatInput/boolean';
export * from './_chatInput/channel';
export * from './_chatInput/integer';
export * from './_chatInput/mentionable';
export * from './_chatInput/number';
export * from './_chatInput/role';
export * from './_chatInput/shared';
export * from './_chatInput/string';
export * from './_chatInput/subcommand';
export * from './_chatInput/subcommandGroup';
export * from './_chatInput/user';
/**
 * https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-option-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandBasicOption = APIApplicationCommandAttachmentOption | APIApplicationCommandBooleanOption | APIApplicationCommandChannelOption | APIApplicationCommandIntegerOption | APIApplicationCommandMentionableOption | APIApplicationCommandNumberOption | APIApplicationCommandRoleOption | APIApplicationCommandStringOption | APIApplicationCommandUserOption;
/**
 * https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-option-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandOption = APIApplicationCommandBasicOption | APIApplicationCommandSubcommandGroupOption | APIApplicationCommandSubcommandOption;
/**
 * https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-interaction-data-option-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandInteractionDataOption = APIApplicationCommandInteractionDataBasicOption | APIApplicationCommandInteractionDataSubcommandGroupOption | APIApplicationCommandInteractionDataSubcommandOption;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandInteractionDataBasicOption = APIApplicationCommandInteractionDataAttachmentOption | APIApplicationCommandInteractionDataBooleanOption | APIApplicationCommandInteractionDataChannelOption | APIApplicationCommandInteractionDataIntegerOption | APIApplicationCommandInteractionDataMentionableOption | APIApplicationCommandInteractionDataNumberOption | APIApplicationCommandInteractionDataRoleOption | APIApplicationCommandInteractionDataStringOption | APIApplicationCommandInteractionDataUserOption;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object-interaction-data-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIChatInputApplicationCommandInteractionData extends APIBaseApplicationCommandInteractionData<ApplicationCommandType.ChatInput> {
    options?: APIApplicationCommandInteractionDataOption[];
    resolved?: APIChatInputApplicationCommandInteractionDataResolved;
}
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object-resolved-data-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIChatInputApplicationCommandInteractionDataResolved {
    users?: Record<Snowflake, APIUser>;
    roles?: Record<Snowflake, APIRole>;
    members?: Record<Snowflake, APIInteractionDataResolvedGuildMember>;
    channels?: Record<Snowflake, APIInteractionDataResolvedChannel>;
    attachments?: Record<Snowflake, APIAttachment>;
}
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIChatInputApplicationCommandInteraction = APIApplicationCommandInteractionWrapper<APIChatInputApplicationCommandInteractionData>;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIChatInputApplicationCommandDMInteraction = APIDMInteractionWrapper<APIChatInputApplicationCommandInteraction>;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIChatInputApplicationCommandGuildInteraction = APIGuildInteractionWrapper<APIChatInputApplicationCommandInteraction>;
//# sourceMappingURL=chatInput.d.ts.map