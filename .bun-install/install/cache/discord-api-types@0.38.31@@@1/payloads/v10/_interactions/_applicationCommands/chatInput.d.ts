import type { APIInteractionDataResolved, InteractionType } from '../../index';
import type { APIApplicationCommandInteractionWrapper, ApplicationCommandType } from '../applicationCommands';
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
export type * from './_chatInput/attachment';
export type * from './_chatInput/base';
export type * from './_chatInput/boolean';
export type * from './_chatInput/channel';
export type * from './_chatInput/integer';
export type * from './_chatInput/mentionable';
export type * from './_chatInput/number';
export type * from './_chatInput/role';
export * from './_chatInput/shared';
export type * from './_chatInput/string';
export type * from './_chatInput/subcommand';
export type * from './_chatInput/subcommandGroup';
export type * from './_chatInput/user';
/**
 * @see {@link https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-option-structure}
 */
export type APIApplicationCommandBasicOption = APIApplicationCommandAttachmentOption | APIApplicationCommandBooleanOption | APIApplicationCommandChannelOption | APIApplicationCommandIntegerOption | APIApplicationCommandMentionableOption | APIApplicationCommandNumberOption | APIApplicationCommandRoleOption | APIApplicationCommandStringOption | APIApplicationCommandUserOption;
/**
 * @see {@link https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-option-structure}
 */
export type APIApplicationCommandOption = APIApplicationCommandBasicOption | APIApplicationCommandSubcommandGroupOption | APIApplicationCommandSubcommandOption;
/**
 * @see {@link https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-interaction-data-option-structure}
 */
export type APIApplicationCommandInteractionDataOption<Type extends InteractionType = InteractionType> = APIApplicationCommandInteractionDataBasicOption<Type> | APIApplicationCommandInteractionDataSubcommandGroupOption<Type> | APIApplicationCommandInteractionDataSubcommandOption<Type>;
export type APIApplicationCommandInteractionDataBasicOption<Type extends InteractionType = InteractionType> = APIApplicationCommandInteractionDataAttachmentOption | APIApplicationCommandInteractionDataBooleanOption | APIApplicationCommandInteractionDataChannelOption | APIApplicationCommandInteractionDataIntegerOption<Type> | APIApplicationCommandInteractionDataMentionableOption | APIApplicationCommandInteractionDataNumberOption<Type> | APIApplicationCommandInteractionDataRoleOption | APIApplicationCommandInteractionDataStringOption | APIApplicationCommandInteractionDataUserOption;
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object-interaction-data}
 */
export interface APIChatInputApplicationCommandInteractionData extends APIBaseApplicationCommandInteractionData<ApplicationCommandType.ChatInput> {
    options?: APIApplicationCommandInteractionDataOption<InteractionType.ApplicationCommand>[];
    resolved?: APIInteractionDataResolved;
}
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object-interaction-data}
 */
export interface APIAutocompleteApplicationCommandInteractionData extends APIBaseApplicationCommandInteractionData<ApplicationCommandType.ChatInput> {
    options?: APIApplicationCommandInteractionDataOption<InteractionType.ApplicationCommandAutocomplete>[];
    resolved?: APIInteractionDataResolved;
}
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object}
 */
export type APIChatInputApplicationCommandInteraction = APIApplicationCommandInteractionWrapper<APIChatInputApplicationCommandInteractionData>;
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object}
 */
export type APIChatInputApplicationCommandDMInteraction = APIDMInteractionWrapper<APIChatInputApplicationCommandInteraction>;
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object}
 */
export type APIChatInputApplicationCommandGuildInteraction = APIGuildInteractionWrapper<APIChatInputApplicationCommandInteraction>;
//# sourceMappingURL=chatInput.d.ts.map