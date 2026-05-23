import type { Permissions, Snowflake } from '../../../globals';
import type { APIPartialChannel } from '../channel';
import type { APIGuildMember } from '../guild';
import type { APIApplicationCommandOption, APIChatInputApplicationCommandDMInteraction, APIChatInputApplicationCommandGuildInteraction, APIChatInputApplicationCommandInteraction, APIChatInputApplicationCommandInteractionData } from './_applicationCommands/chatInput';
import type { APIContextMenuDMInteraction, APIContextMenuGuildInteraction, APIContextMenuInteraction, APIContextMenuInteractionData } from './_applicationCommands/contextMenu';
import type { APIBaseInteraction } from './base';
import type { InteractionType } from './responses';
export * from './_applicationCommands/chatInput';
export * from './_applicationCommands/contextMenu';
export * from './_applicationCommands/permissions';
/**
 * https://discord.com/developers/docs/interactions/application-commands#application-command-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIApplicationCommand {
    /**
     * Unique id of the command
     */
    id: Snowflake;
    /**
     * Type of the command
     */
    type: ApplicationCommandType;
    /**
     * Unique id of the parent application
     */
    application_id: Snowflake;
    /**
     * Guild id of the command, if not global
     */
    guild_id?: Snowflake;
    /**
     * 1-32 character name; `CHAT_INPUT` command names must be all lowercase matching `^[\w-]{1,32}$`
     */
    name: string;
    /**
     * 1-100 character description for `CHAT_INPUT` commands, empty string for `USER` and `MESSAGE` commands
     */
    description: string;
    /**
     * The parameters for the `CHAT_INPUT` command, max 25
     */
    options?: APIApplicationCommandOption[];
    /**
     * Whether the command is enabled by default when the app is added to a guild
     *
     * If missing, this property should be assumed as `true`
     */
    default_permission?: boolean;
    /**
     * Autoincrementing version identifier updated during substantial record changes
     */
    version: Snowflake;
}
/**
 * https://discord.com/developers/docs/interactions/application-commands#application-command-object-application-command-types
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export declare enum ApplicationCommandType {
    ChatInput = 1,
    User = 2,
    Message = 3
}
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object-interaction-data-structure
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandInteractionData = APIChatInputApplicationCommandInteractionData | APIContextMenuInteractionData;
/**
 * https://discord.com/developers/docs/resources/channel#channel-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIInteractionDataResolvedChannel extends Required<APIPartialChannel> {
    permissions: Permissions;
}
/**
 * https://discord.com/developers/docs/resources/guild#guild-member-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIInteractionDataResolvedGuildMember extends Omit<APIGuildMember, 'deaf' | 'mute' | 'user'> {
    permissions: Permissions;
}
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandInteractionWrapper<Data extends APIApplicationCommandInteractionData> = APIBaseInteraction<InteractionType.ApplicationCommand, Data> & Required<Pick<APIBaseInteraction<InteractionType.ApplicationCommand, Data>, 'channel_id' | 'data'>>;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandInteraction = APIChatInputApplicationCommandInteraction | APIContextMenuInteraction;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandDMInteraction = APIChatInputApplicationCommandDMInteraction | APIContextMenuDMInteraction;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandGuildInteraction = APIChatInputApplicationCommandGuildInteraction | APIContextMenuGuildInteraction;
//# sourceMappingURL=applicationCommands.d.ts.map