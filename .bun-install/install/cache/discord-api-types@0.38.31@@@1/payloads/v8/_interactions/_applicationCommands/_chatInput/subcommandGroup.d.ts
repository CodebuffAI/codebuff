import type { APIApplicationCommandOptionBase } from './base';
import type { ApplicationCommandOptionType } from './shared';
import type { APIApplicationCommandInteractionDataSubcommandOption, APIApplicationCommandSubcommandOption } from './subcommand';
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIApplicationCommandSubcommandGroupOption extends APIApplicationCommandOptionBase<ApplicationCommandOptionType.SubcommandGroup> {
    options?: APIApplicationCommandSubcommandOption[];
}
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIApplicationCommandInteractionDataSubcommandGroupOption {
    name: string;
    type: ApplicationCommandOptionType.SubcommandGroup;
    options: APIApplicationCommandInteractionDataSubcommandOption[];
}
//# sourceMappingURL=subcommandGroup.d.ts.map