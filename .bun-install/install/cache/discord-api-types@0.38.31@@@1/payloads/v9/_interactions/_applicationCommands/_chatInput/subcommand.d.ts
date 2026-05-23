import type { InteractionType } from '../../responses';
import type { APIApplicationCommandBasicOption, APIApplicationCommandInteractionDataBasicOption } from '../chatInput';
import type { APIApplicationCommandOptionBase } from './base';
import type { ApplicationCommandOptionType } from './shared';
export interface APIApplicationCommandSubcommandOption extends APIApplicationCommandOptionBase<ApplicationCommandOptionType.Subcommand> {
    options?: APIApplicationCommandBasicOption[];
}
export interface APIApplicationCommandInteractionDataSubcommandOption<Type extends InteractionType = InteractionType> {
    name: string;
    type: ApplicationCommandOptionType.Subcommand;
    options?: APIApplicationCommandInteractionDataBasicOption<Type>[];
}
//# sourceMappingURL=subcommand.d.ts.map