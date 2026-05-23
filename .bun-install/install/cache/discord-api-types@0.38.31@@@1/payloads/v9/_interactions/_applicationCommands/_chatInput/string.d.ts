import type { APIApplicationCommandOptionBase, APIApplicationCommandOptionWithAutocompleteOrChoicesWrapper, APIInteractionDataOptionBase } from './base';
import type { APIApplicationCommandOptionChoice, ApplicationCommandOptionType } from './shared';
export interface APIApplicationCommandStringOptionBase extends APIApplicationCommandOptionBase<ApplicationCommandOptionType.String> {
    /**
     * For option type `STRING`, the minimum allowed length (minimum of `0`, maximum of `6000`).
     */
    min_length?: number;
    /**
     * For option type `STRING`, the maximum allowed length (minimum of `1`, maximum of `6000`).
     */
    max_length?: number;
}
export type APIApplicationCommandStringOption = APIApplicationCommandOptionWithAutocompleteOrChoicesWrapper<APIApplicationCommandStringOptionBase, APIApplicationCommandOptionChoice<string>>;
export interface APIApplicationCommandInteractionDataStringOption extends APIInteractionDataOptionBase<ApplicationCommandOptionType.String, string> {
    focused?: boolean;
}
//# sourceMappingURL=string.d.ts.map