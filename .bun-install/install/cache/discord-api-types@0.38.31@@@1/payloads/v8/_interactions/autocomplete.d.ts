import type { APIBaseInteraction, APIChatInputApplicationCommandInteractionData, APIDMInteractionWrapper, APIGuildInteractionWrapper, InteractionType } from '../index';
/**
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandAutocompleteInteraction = APIBaseInteraction<InteractionType.ApplicationCommandAutocomplete, APIChatInputApplicationCommandInteractionData> & Required<Pick<APIBaseInteraction<InteractionType.ApplicationCommandAutocomplete, Required<Pick<APIChatInputApplicationCommandInteractionData, 'options'>>>, 'data'>>;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandAutocompleteDMInteraction = APIDMInteractionWrapper<APIApplicationCommandAutocompleteInteraction>;
/**
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 *
 * @deprecated API and gateway v8 are deprecated and the types will not receive further updates, please update to v10.
 */
export type APIApplicationCommandAutocompleteGuildInteraction = APIGuildInteractionWrapper<APIApplicationCommandAutocompleteInteraction>;
//# sourceMappingURL=autocomplete.d.ts.map