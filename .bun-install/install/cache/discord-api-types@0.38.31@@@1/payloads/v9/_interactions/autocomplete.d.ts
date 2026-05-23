import type { APIBaseInteraction, APIAutocompleteApplicationCommandInteractionData, APIDMInteractionWrapper, APIGuildInteractionWrapper, InteractionType } from '../index';
export type APIApplicationCommandAutocompleteInteraction = APIBaseInteraction<InteractionType.ApplicationCommandAutocomplete, APIAutocompleteApplicationCommandInteractionData> & Required<Pick<APIBaseInteraction<InteractionType.ApplicationCommandAutocomplete, Required<Pick<APIAutocompleteApplicationCommandInteractionData, 'options'>>>, 'data'>>;
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object}
 */
export type APIApplicationCommandAutocompleteDMInteraction = APIDMInteractionWrapper<APIApplicationCommandAutocompleteInteraction>;
/**
 * @see {@link https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object}
 */
export type APIApplicationCommandAutocompleteGuildInteraction = APIGuildInteractionWrapper<APIApplicationCommandAutocompleteInteraction>;
//# sourceMappingURL=autocomplete.d.ts.map