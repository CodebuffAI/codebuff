import type { APIApplicationCommandOptionBase, APIApplicationCommandOptionWithAutocompleteOrChoicesWrapper, APIInteractionDataOptionBase } from './base';
import type { APIApplicationCommandOptionChoice, ApplicationCommandOptionType } from './shared';
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandStringOption = APIApplicationCommandOptionWithAutocompleteOrChoicesWrapper<APIApplicationCommandOptionBase<ApplicationCommandOptionType.String>, APIApplicationCommandOptionChoice<string>>;
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export interface APIApplicationCommandInteractionDataStringOption extends APIInteractionDataOptionBase<ApplicationCommandOptionType.String, string> {
    focused?: boolean;
}
//# sourceMappingURL=string.d.ts.map